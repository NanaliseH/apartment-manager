import { useState, useRef, useCallback, useEffect } from "react";

// ── auth ─────────────────────────────────────────────────────────────────────
const APP_PASSWORD = "apartment2024"; // ← change this to your password

function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [show, setShow] = useState(false);

  const attempt = () => {
    if (pw === APP_PASSWORD) {
      save("apt_auth", true);
      onLogin();
    } else {
      setError(true);
      setPw("");
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#1a1a2e", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Sarabun','Tahoma',sans-serif" }}>
      <div style={{ background:"white", borderRadius:16, padding:"40px 36px", width:340, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🏢</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#1a1a2e" }}>ระบบจัดการอพาร์ตเมนต์</div>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน</div>
        </div>
        <div style={{ position:"relative", marginBottom:12 }}>
          <input
            type={show ? "text" : "password"}
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && attempt()}
            placeholder="รหัสผ่าน"
            autoFocus
            style={{ width:"100%", padding:"12px 44px 12px 14px", border:`2px solid ${error?"#ef4444":"#e2e8f0"}`, borderRadius:10, fontSize:15, outline:"none", boxSizing:"border-box", transition:"border 0.2s" }}
          />
          <button onClick={() => setShow(s=>!s)}
            style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8" }}>
            {show ? "🙈" : "👁️"}
          </button>
        </div>
        {error && <div style={{ color:"#ef4444", fontSize:13, marginBottom:8, textAlign:"center" }}>รหัสผ่านไม่ถูกต้อง ลองใหม่อีกครั้ง</div>}
        <button onClick={attempt}
          style={{ width:"100%", padding:"12px", background:"#1a1a2e", color:"white", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", marginTop:4 }}>
          เข้าสู่ระบบ
        </button>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
// ── local storage helpers ────────────────────────────────────────────────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
const fmt = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; };
const ROOM_NUMBERS = Array.from({ length: 9 }, (_, floor) =>
  Array.from({ length: 18 }, (_, room) => `${21 + floor}${String(room + 1).padStart(2, "0")}`)
).flat();
const INIT_SETTINGS = { buildingName:"อพาร์ตเมนต์ของฉัน", ownerName:"", bankName:"", accountNumber:"", rent:5500, waterRate:18, elecRate:8, parkingMoto:300, parkingCar:600, month:new Date().toLocaleString("th-TH",{month:"long",year:"numeric"}) };
// parking: "" = none, "moto" = motorbike, "car" = car, "both" = both
const INIT_ROOMS = ROOM_NUMBERS.map((room,i) => ({ id:i+1, room, name:"", prevWater:"", currWater:"", prevElec:"", currElec:"", parking:"", parkingOverride:"", paid:false, paidAmount:null, paidDate:null, slipStatus:null }));

function fileToBase64(file) {
  return new Promise((res,rej) => { const r=new FileReader(); r.onload=e=>res(e.target.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
}

function parkingFee(r, settings) {
  if (r.parkingOverride !== "") return parseFloat(r.parkingOverride) || 0;
  if (r.parking === "moto") return settings.parkingMoto;
  if (r.parking === "car")  return settings.parkingCar;
  if (r.parking === "both") return settings.parkingMoto + settings.parkingCar;
  return 0;
}
function roomTotal(r, settings) {
  const usedW = Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
  const usedE = Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
  return settings.rent + usedW*settings.waterRate + usedE*settings.elecRate + parkingFee(r, settings);
}

// ── AI: read meter ────────────────────────────────────────────────────────────
async function readMeterPhoto(base64, mediaType) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:100,
      messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:mediaType, data:base64 }},
        { type:"text", text:`Read the number on this utility meter. Reply ONLY with JSON: {"reading":12345,"confidence":"high"}. If unclear use confidence "low". No markdown.` }
      ]}]
    })
  });
  const data = await res.json();
  const text = data.content?.map(b=>b.text||"").join("") || "";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return { reading:null, confidence:"error" }; }
}

// ── AI: verify payment slip ───────────────────────────────────────────────────
async function verifySlip(base64, mediaType, expectedAmount, expectedRecipient, bankAccountHint) {
  const prompt = `You are a Thai bank payment slip verification expert helping an apartment owner detect fake slips.

Analyze this payment slip image carefully.

Expected payment details:
- Amount: ฿${fmt(expectedAmount)}
- Recipient name hint: "${expectedRecipient || "not specified"}"
- Bank account hint: "${bankAccountHint || "not specified"}"

Please examine:
1. Is this a genuine-looking Thai bank transfer slip or PromptPay slip?
2. What amount is shown?
3. What date/time is shown?
4. What bank is this from?
5. What is the recipient name shown?
6. Are there any signs of tampering or fakery? Look for: blurry or pixelated text, inconsistent fonts, edited numbers, unnatural colors, missing bank logo/watermark, text that looks copy-pasted, suspicious alignment

Reply ONLY with this JSON (no markdown, no extra text):
{
  "amount": 3500.00,
  "date": "20/6/2025",
  "time": "14:32",
  "bank": "Krungthai",
  "recipientName": "สมชาย",
  "amountMatch": true,
  "verdict": "GENUINE",
  "confidence": "high",
  "flags": [],
  "summary": "สลิปดูปกติ จำนวนเงินตรงกัน"
}

verdict must be one of: "GENUINE", "SUSPICIOUS", "LIKELY_FAKE"
flags is an array of strings describing any issues found (empty if none)
confidence is "high", "medium", or "low"`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:400,
      messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:mediaType, data:base64 }},
        { type:"text", text:prompt }
      ]}]
    })
  });
  const data = await res.json();
  const text = data.content?.map(b=>b.text||"").join("") || "";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return { verdict:"SUSPICIOUS", confidence:"low", flags:["ไม่สามารถอ่านสลิปได้"], summary:"เกิดข้อผิดพลาดในการวิเคราะห์", amount:null, date:null, bank:null }; }
}

// ── print ─────────────────────────────────────────────────────────────────────
function generatePrintHTML(rooms, settings) {
  const bills = rooms.filter(r => r.name || r.currWater || r.currElec);
  const f = (n) => Number(n||0).toLocaleString("th-TH",{minimumFractionDigits:2});
  const billsHTML = bills.map(r => {
    const usedW = Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
    const usedE = Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
    const waterFee = usedW*settings.waterRate, elecFee=usedE*settings.elecRate;
    const pFee = parkingFee(r, settings);
    const parkingLabel = r.parking==="moto"?"มอเตอร์ไซค์":r.parking==="car"?"รถยนต์":r.parking==="both"?"มอเตอร์ไซค์ + รถยนต์":"";
    const total = settings.rent+waterFee+elecFee+pFee;
    return `<div class="bill">
      <div class="bh"><div class="bn">${settings.buildingName}</div><div class="bt">ใบแจ้งค่าใช้จ่าย</div>
      <div class="bm"><span>ห้อง: <strong>${r.room}</strong></span><span>ผู้เช่า: <strong>${r.name||"-"}</strong></span><span>ประจำเดือน: <strong>${settings.month}</strong></span><span>วันที่ออก: ${today()}</span></div></div>
      <table><thead><tr><th>รายการ</th><th>ก่อน</th><th>หลัง</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>รวม</th></tr></thead>
      <tbody>
        <tr><td>ค่าเช่าห้อง</td><td>-</td><td>-</td><td>-</td><td>-</td><td>฿${f(settings.rent)}</td></tr>
        <tr><td>ค่าน้ำ</td><td>${r.prevWater||0}</td><td>${r.currWater||0}</td><td>${usedW}</td><td>฿${settings.waterRate}</td><td>฿${f(waterFee)}</td></tr>
        <tr><td>ค่าไฟ</td><td>${r.prevElec||0}</td><td>${r.currElec||0}</td><td>${usedE}</td><td>฿${settings.elecRate}</td><td>฿${f(elecFee)}</td></tr>
        ${pFee>0?`<tr><td>ค่าจอดรถ (${parkingLabel})</td><td>-</td><td>-</td><td>-</td><td>-</td><td>฿${f(pFee)}</td></tr>`:""}
      </tbody>
      <tfoot><tr class="tr"><td colspan="5">ยอดรวมที่ต้องชำระ</td><td>฿${f(total)}</td></tr></tfoot></table>
      <div class="bf">กรุณาชำระภายในวันที่ 5 ของเดือนถัดไป · ขอบคุณค่ะ</div>
    </div>`;
  }).join("");
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:'Sarabun','Tahoma',sans-serif;font-size:13px;background:#f5f5f5}
    .bill{width:148mm;background:white;margin:6mm auto;padding:8mm;border:1px solid #ddd;page-break-after:always;border-radius:4px}
    .bn{font-size:16px;font-weight:700;color:#1a1a2e}.bt{font-size:12px;color:#64748b;margin-bottom:5px}
    .bm{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;background:#f8fafc;padding:5px 8px;border-radius:4px;margin-bottom:8px;color:#334155}
    table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a1a2e;color:white;padding:5px 6px;text-align:left}
    td{padding:5px 6px;border-bottom:1px solid #f0f0f0}td:not(:first-child){text-align:center}td:last-child{text-align:right}
    .tr{background:#fff9f0;font-weight:700}.tr td:last-child{color:#dc2626;font-size:14px}
    .bf{margin-top:8px;font-size:11px;color:#94a3b8;text-align:center;padding-top:6px;border-top:1px dashed #e2e8f0}
    @media print{body{background:white}.bill{margin:0;border-radius:0;page-break-after:always}}
  </style></head><body>${billsHTML}</body></html>`;
}

// ── PhotoCard (meter) ─────────────────────────────────────────────────────────
let idCounter = 0;
function MeterPhotoCard({ item, rooms, onAssign, onManualReading, onRemove }) {
  const [room, setRoom] = useState("");
  const [type, setType] = useState("");
  const [override, setOverride] = useState("");
  const reading = override !== "" ? override : (item.reading ?? "");
  const canApply = room && type && reading !== "";
  const cc = { high:"#22c55e", low:"#f59e0b", error:"#ef4444" };
  return (
    <div style={S.photoCard}>
      <div style={{ position:"relative" }}>
        <img src={item.preview} alt="meter" style={S.photoImg} />
        <span style={{ ...S.badge, background: cc[item.confidence]||"#94a3b8" }}>
          {item.status==="reading"?"⏳":item.confidence==="high"?"✅":item.confidence==="low"?"⚠️":"❌"}
        </span>
        <button onClick={()=>onRemove(item.id)} style={S.removeBtn}>✕</button>
      </div>
      <div style={{ padding:"8px 10px 10px", display:"flex", flexDirection:"column", gap:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:12, color:"#64748b" }}>มิเตอร์:</span>
          {item.status==="reading"
            ? <span style={{ color:"#94a3b8", fontSize:12 }}>กำลังอ่าน...</span>
            : <input value={reading} onChange={e=>{setOverride(e.target.value);onManualReading(item.id,e.target.value);}}
                placeholder="แก้ไขได้" style={{ ...S.inputTiny, width:90, fontWeight:700 }} />}
        </div>
        <select value={room} onChange={e=>setRoom(e.target.value)} style={S.inputTiny}>
          <option value="">ห้อง...</option>
          {rooms.map(r=><option key={r.room} value={r.room}>ห้อง {r.room}{r.name?` · ${r.name}`:""}</option>)}
        </select>
        <select value={type} onChange={e=>setType(e.target.value)} style={S.inputTiny}>
          <option value="">ประเภท...</option>
          <option value="prevWater">น้ำ – ก่อน</option><option value="currWater">น้ำ – หลัง</option>
          <option value="prevElec">ไฟ – ก่อน</option><option value="currElec">ไฟ – หลัง</option>
        </select>
        <button onClick={()=>onAssign(item.id,room,type,reading)} disabled={!canApply}
          style={{ ...S.applyBtn, ...(canApply?{}:S.applyDisabled) }}>
          {item.assigned?"✅ บันทึกแล้ว":"บันทึก →"}
        </button>
      </div>
    </div>
  );
}

// ── SlipVerifier ──────────────────────────────────────────────────────────────
function SlipVerifier({ rooms, settings }) {
  const [selectedRoom, setSelectedRoom] = useState("");
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const room = rooms.find(r => r.room === selectedRoom);
  const expected = room ? roomTotal(room, settings) : null;

  const handleFile = (file) => {
    if (!file?.type.startsWith("image/")) return;
    setSlipFile(file);
    setSlipPreview(URL.createObjectURL(file));
    setResult(null);
  };

  const analyze = async () => {
    if (!slipFile) return;
    setAnalyzing(true);
    try {
      const b64 = await fileToBase64(slipFile);
      const r = await verifySlip(b64, slipFile.type, expected, settings.ownerName, settings.accountNumber);
      setResult(r);
    } catch(e) {
      setResult({ verdict:"SUSPICIOUS", confidence:"low", flags:["เกิดข้อผิดพลาด: "+e.message], summary:"ไม่สามารถวิเคราะห์ได้" });
    }
    setAnalyzing(false);
  };

  const verdictStyle = {
    GENUINE:     { bg:"#f0fdf4", border:"#22c55e", icon:"✅", label:"ดูเป็นของจริง",   color:"#15803d" },
    SUSPICIOUS:  { bg:"#fffbeb", border:"#f59e0b", icon:"⚠️", label:"น่าสงสัย",        color:"#92400e" },
    LIKELY_FAKE: { bg:"#fef2f2", border:"#ef4444", icon:"🚨", label:"น่าจะปลอม",       color:"#dc2626" },
  };
  const vs = result ? (verdictStyle[result.verdict] || verdictStyle.SUSPICIOUS) : null;

  return (
    <div>
      <div style={S.card}>
        <h2 style={S.cardTitle}>🧾 ตรวจสอบสลิปการชำระเงิน</h2>
        <p style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>
          AI จะอ่านข้อมูลจากสลิป ตรวจสอบจำนวนเงิน และหาสัญญาณของสลิปปลอม
        </p>

        <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:16 }}>
          {/* room selector */}
          <div style={{ flex:"1", minWidth:200 }}>
            <label style={S.fieldLabel}>ห้องที่ต้องการตรวจ</label>
            <select value={selectedRoom} onChange={e=>{setSelectedRoom(e.target.value);setResult(null);}} style={{ ...S.inputFull, marginTop:4 }}>
              <option value="">-- เลือกห้อง --</option>
              {rooms.map(r=><option key={r.room} value={r.room}>
                ห้อง {r.room}{r.name?` · ${r.name}`:""}{r.paid?" ✅":""}
              </option>)}
            </select>
            {room && (
              <div style={S.expectedBox}>
                <span style={{ color:"#475569" }}>ยอดที่ต้องชำระ:</span>
                <span style={{ fontWeight:700, fontSize:18, color:"#1a1a2e" }}>฿{fmt(expected)}</span>
              </div>
            )}
          </div>

          {/* slip upload */}
          <div style={{ flex:"2", minWidth:260 }}>
            <label style={S.fieldLabel}>อัพโหลดสลิป</label>
            <div
              style={{ ...S.slipDrop, marginTop:4, ...(dragOver?S.dropActive:{}) }}
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
              onClick={()=>fileRef.current.click()}
            >
              {slipPreview
                ? <img src={slipPreview} alt="slip" style={{ maxHeight:160, maxWidth:"100%", borderRadius:6, objectFit:"contain" }} />
                : <div style={{ color:"#94a3b8", fontSize:13 }}>📎 วางสลิปที่นี่ หรือคลิกเพื่อเลือก</div>}
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
                onChange={e=>handleFile(e.target.files[0])} />
            </div>
          </div>
        </div>

        <button onClick={analyze} disabled={!slipFile||analyzing}
          style={{ ...S.btnPrimary, opacity:(!slipFile||analyzing)?0.5:1 }}>
          {analyzing ? "🔍 กำลังวิเคราะห์..." : "🔍 ตรวจสอบสลิป"}
        </button>
      </div>

      {/* result */}
      {result && vs && (
        <div style={{ ...S.card, border:`2px solid ${vs.border}`, background:vs.bg }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
            <span style={{ fontSize:32 }}>{vs.icon}</span>
            <div>
              <div style={{ fontSize:20, fontWeight:700, color:vs.color }}>{vs.label}</div>
              <div style={{ fontSize:13, color:"#64748b" }}>ความมั่นใจ: {result.confidence}</div>
            </div>
          </div>

          {/* extracted info */}
          <div style={S.infoGrid}>
            {[
              ["💰 จำนวนเงิน", result.amount!=null ? `฿${fmt(result.amount)}` : "อ่านไม่ได้"],
              ["📅 วันที่", result.date || "-"],
              ["🕐 เวลา", result.time || "-"],
              ["🏦 ธนาคาร", result.bank || "-"],
              ["👤 ชื่อผู้รับ", result.recipientName || "-"],
              ["💳 ตรงยอด", result.amountMatch===true?"✅ ตรง":result.amountMatch===false?"❌ ไม่ตรง":"ไม่ระบุ"],
            ].map(([label, val]) => (
              <div key={label} style={S.infoCell}>
                <div style={{ fontSize:12, color:"#64748b" }}>{label}</div>
                <div style={{ fontSize:14, fontWeight:600, color:"#1a1a2e", marginTop:2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* flags */}
          {result.flags?.length > 0 && (
            <div style={S.flagsBox}>
              <div style={{ fontWeight:700, color:"#92400e", marginBottom:6, fontSize:13 }}>⚠️ สิ่งที่น่าสงสัย</div>
              {result.flags.map((f,i) => (
                <div key={i} style={{ fontSize:13, color:"#78350f", padding:"3px 0", borderBottom:"1px solid #fde68a" }}>· {f}</div>
              ))}
            </div>
          )}

          <div style={{ marginTop:12, fontSize:14, color:"#334155", background:"white", padding:"10px 14px", borderRadius:8 }}>
            📝 {result.summary}
          </div>

          {/* action buttons */}
          {selectedRoom && (
            <div style={{ display:"flex", gap:10, marginTop:14, flexWrap:"wrap" }}>
              <button onClick={()=>{
                  // mark room as paid
                  alert(`✅ ทำเครื่องหมายห้อง ${selectedRoom} ว่าชำระแล้ว`);
                }} style={{ ...S.btnPrimary, background:"#22c55e" }}>
                ✅ ยืนยันว่าชำระแล้ว
              </button>
              <button onClick={()=>{ setResult(null); setSlipFile(null); setSlipPreview(null); }}
                style={{ ...S.btnPrimary, background:"#64748b" }}>
                ตรวจสลิปใหม่
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── payment tracker ───────────────────────────────────────────────────────────
function PaymentTracker({ rooms, settings, onTogglePaid }) {
  const [filter, setFilter] = useState("all");
  const paid = rooms.filter(r=>r.paid).length;
  const unpaid = rooms.filter(r=>!r.paid && (r.name||r.currWater||r.currElec)).length;
  const totalDue = rooms.reduce((acc,r)=>{ if(!r.name&&!r.currWater&&!r.currElec) return acc; return acc+roomTotal(r,settings); },0);
  const totalPaid = rooms.filter(r=>r.paid).reduce((acc,r)=>acc+roomTotal(r,settings),0);

  const visible = rooms.filter(r => {
    if (!r.name && !r.currWater && !r.currElec) return false;
    if (filter==="paid") return r.paid;
    if (filter==="unpaid") return !r.paid;
    return true;
  });

  return (
    <div>
      <div style={{ display:"flex", gap:12, marginBottom:16, flexWrap:"wrap" }}>
        {[["all","ทั้งหมด"],["paid","จ่ายแล้ว ✅"],["unpaid","ยังไม่จ่าย ⏳"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{ ...S.filterBtn, ...(filter===v?S.filterActive:{}) }}>{l}</button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:20 }}>
        {[
          ["💰 ยอดรวมทั้งหมด", `฿${fmt(totalDue)}`, "#1a1a2e"],
          ["✅ รับเงินแล้ว", `฿${fmt(totalPaid)}`, "#22c55e"],
          ["⏳ รอรับเงิน", `฿${fmt(totalDue-totalPaid)}`, "#f59e0b"],
          ["📊 จ่ายแล้ว", `${paid} ห้อง`, "#3b82f6"],
        ].map(([label,val,color])=>(
          <div key={label} style={{ ...S.statCard }}>
            <div style={{ fontSize:12, color:"#64748b" }}>{label}</div>
            <div style={{ fontSize:18, fontWeight:700, color, marginTop:4 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8 }}>
        {visible.map(r => {
          const total = roomTotal(r,settings);
          return (
            <div key={r.room} style={{ ...S.roomCard, ...(r.paid?S.roomPaid:S.roomUnpaid) }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <span style={S.roomBadge}>ห้อง {r.room}</span>
                <span style={{ fontSize:16 }}>{r.paid?"✅":"⏳"}</span>
              </div>
              <div style={{ fontSize:12, color:"#475569", margin:"4px 0", minHeight:16 }}>{r.name||<span style={{color:"#cbd5e1"}}>ไม่ระบุชื่อ</span>}</div>
              {r.parking && <div style={{ fontSize:11, color:"#7c3aed" }}>{r.parking==="moto"?"🏍️ มอไซค์":r.parking==="car"?"🚗 รถยนต์":"🏍️🚗 ทั้งคู่"}</div>}
              <div style={{ fontSize:15, fontWeight:700, color:"#1a1a2e" }}>฿{fmt(total)}</div>
              <button onClick={()=>onTogglePaid(r.room)}
                style={{ ...S.toggleBtn, ...(r.paid?S.togglePaid:S.toggleUnpaid) }}>
                {r.paid?"ยกเลิก":"ทำเครื่องหมายจ่ายแล้ว"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── MailTracker ───────────────────────────────────────────────────────────────
let mailId = 0;

function daysSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function lineMessage(mail, roomName, buildingName, isReminder) {
  const typeLabel = mail.mailType === "package" ? "พัสดุ" : "จดหมาย";
  const from = mail.sender ? ` จาก ${mail.sender}` : "";
  if (isReminder) {
    return `🔔 แจ้งเตือนอีกครั้ง ห้อง ${mail.room}

มี${typeLabel}${from} รอรับอยู่ที่ ${buildingName} แล้ว ${daysSince(mail.arrivedAt)} วัน
กรุณามารับที่เคาน์เตอร์ด้วยนะคะ 🙏`;
  }
  return `📬 แจ้งห้อง ${mail.room}${roomName ? ` (${roomName})` : ""}

มี${typeLabel}${from} มาถึงแล้วค่ะ
กรุณามารับที่เคาน์เตอร์ ${buildingName} ได้เลยนะคะ 🙏`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(()=>setCopied(false), 2000); });
  };
  return (
    <button onClick={copy} style={{ padding:"4px 10px", fontSize:12, border:"1px solid #e2e8f0",
      borderRadius:6, cursor:"pointer", background: copied?"#dcfce7":"white", color: copied?"#15803d":"#475569" }}>
      {copied ? "✅ คัดลอกแล้ว" : "📋 คัดลอก LINE"}
    </button>
  );
}

function MailTracker({ rooms, mails, setMails, remindDays, setRemindDays, buildingName }) {
  const [form, setForm] = useState({ room:"", mailType:"package", sender:"", notes:"" });
  const [filter, setFilter] = useState("pending");
  const [adding, setAdding] = useState(false);

  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const addMail = () => {
    if (!form.room) return;
    const room = rooms.find(r=>r.room===form.room);
    setMails(m=>[{ id:++mailId, ...form, roomName: room?.name||"", arrivedAt: new Date().toISOString(),
      notifiedAt: null, status:"arrived" }, ...m]);
    setForm({ room:"", mailType:"package", sender:"", notes:"" });
    setAdding(false);
  };

  const markNotified = (id) => setMails(m=>m.map(x=>x.id===id?{...x,status:"notified",notifiedAt:new Date().toISOString()}:x));
  const markPicked   = (id) => setMails(m=>m.map(x=>x.id===id?{...x,status:"picked",pickedAt:new Date().toISOString()}:x));
  const deleteMail   = (id) => setMails(m=>m.filter(x=>x.id!==id));

  const pending  = mails.filter(m=>m.status!=="picked");
  const overdue  = pending.filter(m=>daysSince(m.arrivedAt)>=remindDays);
  const visible  = filter==="all" ? mails : filter==="picked" ? mails.filter(m=>m.status==="picked") : pending;

  const statusStyle = {
    arrived:  { bg:"#eff6ff", border:"#bfdbfe", icon:"📬", label:"มาถึงแล้ว",   color:"#1d4ed8" },
    notified: { bg:"#fefce8", border:"#fde68a", icon:"🔔", label:"แจ้งแล้ว",    color:"#92400e" },
    picked:   { bg:"#f0fdf4", border:"#bbf7d0", icon:"✅", label:"รับแล้ว",     color:"#15803d" },
  };

  return (
    <div>
      {/* summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10, marginBottom:16 }}>
        {[
          ["📬 รอรับ", pending.length, "#1d4ed8"],
          ["🔔 แจ้งแล้ว", mails.filter(m=>m.status==="notified").length, "#92400e"],
          ["⚠️ เกิน "+remindDays+" วัน", overdue.length, "#dc2626"],
          ["✅ รับแล้ว", mails.filter(m=>m.status==="picked").length, "#15803d"],
        ].map(([label,val,color])=>(
          <div key={label} style={{ background:"white", borderRadius:10, padding:"12px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize:12, color:"#64748b" }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:700, color, marginTop:4 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* overdue banner */}
      {overdue.length > 0 && (
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight:700, color:"#dc2626", fontSize:14 }}>มี {overdue.length} รายการที่รอเกิน {remindDays} วัน</div>
            <div style={{ fontSize:12, color:"#b91c1c" }}>ควรส่งข้อความเตือนซ้ำให้ผู้เช่าค่ะ</div>
          </div>
        </div>
      )}

      {/* toolbar */}
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        {[["pending","รอรับ"],["all","ทั้งหมด"],["picked","รับแล้ว"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{ padding:"7px 14px", border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer",
              fontSize:13, background:filter===v?"#1a1a2e":"white", color:filter===v?"white":"#64748b" }}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:13, color:"#64748b" }}>เตือนซ้ำหลัง</span>
          <input type="number" value={remindDays} onChange={e=>setRemindDays(parseInt(e.target.value)||1)}
            style={{ width:48, padding:"5px 8px", border:"1px solid #e2e8f0", borderRadius:6, fontSize:13, textAlign:"center" }} />
          <span style={{ fontSize:13, color:"#64748b" }}>วัน</span>
        </div>
        <button onClick={()=>setAdding(a=>!a)}
          style={{ padding:"7px 16px", background:"#7c3aed", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:13 }}>
          + บันทึกไปรษณีย์ใหม่
        </button>
      </div>

      {/* add form */}
      {adding && (
        <div style={{ background:"white", borderRadius:12, padding:18, marginBottom:16, border:"2px solid #7c3aed", boxShadow:"0 2px 8px rgba(124,58,237,0.1)" }}>
          <h3 style={{ fontSize:15, fontWeight:700, color:"#1a1a2e", marginBottom:14 }}>📬 บันทึกไปรษณีย์ใหม่</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:12, fontWeight:600, color:"#475569" }}>ห้อง *</span>
              <select value={form.room} onChange={e=>setF("room",e.target.value)}
                style={{ padding:"7px 9px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:13 }}>
                <option value="">-- เลือกห้อง --</option>
                {rooms.map(r=><option key={r.room} value={r.room}>ห้อง {r.room}{r.name?` · ${r.name}`:""}</option>)}
              </select>
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:12, fontWeight:600, color:"#475569" }}>ประเภท</span>
              <select value={form.mailType} onChange={e=>setF("mailType",e.target.value)}
                style={{ padding:"7px 9px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:13 }}>
                <option value="package">📦 พัสดุ</option>
                <option value="letter">✉️ จดหมาย</option>
              </select>
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:12, fontWeight:600, color:"#475569" }}>ผู้ส่ง / จาก</span>
              <input value={form.sender} onChange={e=>setF("sender",e.target.value)} placeholder="เช่น Shopee, ไปรษณีย์ไทย"
                style={{ padding:"7px 9px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:13 }} />
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:12, fontWeight:600, color:"#475569" }}>หมายเหตุ</span>
              <input value={form.notes} onChange={e=>setF("notes",e.target.value)} placeholder="เช่น กล่องใหญ่, ด่วน"
                style={{ padding:"7px 9px", border:"1px solid #e2e8f0", borderRadius:7, fontSize:13 }} />
            </label>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button onClick={addMail} disabled={!form.room}
              style={{ padding:"8px 20px", background: form.room?"#7c3aed":"#e2e8f0", color: form.room?"white":"#94a3b8",
                border:"none", borderRadius:8, cursor: form.room?"pointer":"not-allowed", fontWeight:700, fontSize:14 }}>
              บันทึก
            </button>
            <button onClick={()=>setAdding(false)}
              style={{ padding:"8px 16px", background:"#f1f5f9", color:"#475569", border:"none", borderRadius:8, cursor:"pointer", fontSize:14 }}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* mail list */}
      {visible.length === 0
        ? <div style={{ textAlign:"center", color:"#94a3b8", padding:"48px 0", fontSize:14 }}>ไม่มีรายการไปรษณีย์ {filter==="pending"?"ที่รอรับ":""}</div>
        : <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {visible.map(mail => {
              const days = daysSince(mail.arrivedAt);
              const isOverdue = days >= remindDays && mail.status !== "picked";
              const ss = statusStyle[mail.status] || statusStyle.arrived;
              const lineMsg = lineMessage(mail, mail.roomName, buildingName, false);
              const remindMsg = lineMessage(mail, mail.roomName, buildingName, true);
              return (
                <div key={mail.id} style={{ background: isOverdue?"#fff7f7":"white", border:`1px solid ${isOverdue?"#fecaca":ss.border}`,
                  borderRadius:12, padding:"14px 16px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                    {/* left: info */}
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontSize:18 }}>{mail.mailType==="package"?"📦":"✉️"}</span>
                        <span style={{ fontWeight:700, fontSize:15, color:"#1a1a2e" }}>ห้อง {mail.room}</span>
                        {mail.roomName && <span style={{ fontSize:13, color:"#64748b" }}>{mail.roomName}</span>}
                        <span style={{ background:ss.bg, color:ss.color, border:`1px solid ${ss.border}`,
                          fontSize:11, padding:"2px 8px", borderRadius:99, fontWeight:600 }}>{ss.icon} {ss.label}</span>
                        {isOverdue && <span style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca",
                          fontSize:11, padding:"2px 8px", borderRadius:99, fontWeight:600 }}>⚠️ {days} วันแล้ว</span>}
                      </div>
                      {mail.sender && <div style={{ fontSize:13, color:"#475569", marginTop:4 }}>จาก: {mail.sender}</div>}
                      {mail.notes  && <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>หมายเหตุ: {mail.notes}</div>}
                      <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
                        มาถึง: {new Date(mail.arrivedAt).toLocaleDateString("th-TH")}
                        {mail.notifiedAt && ` · แจ้งแล้ว: ${new Date(mail.notifiedAt).toLocaleDateString("th-TH")}`}
                        {mail.pickedAt  && ` · รับแล้ว: ${new Date(mail.pickedAt).toLocaleDateString("th-TH")}`}
                      </div>
                    </div>

                    {/* right: actions */}
                    <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                      {mail.status !== "picked" && (
                        <>
                          <CopyButton text={mail.status==="notified" ? remindMsg : lineMsg} />
                          {mail.status === "arrived" && (
                            <button onClick={()=>markNotified(mail.id)}
                              style={{ padding:"4px 10px", fontSize:12, background:"#fefce8", color:"#92400e",
                                border:"1px solid #fde68a", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
                              🔔 ทำเครื่องหมายว่าแจ้งแล้ว
                            </button>
                          )}
                          <button onClick={()=>markPicked(mail.id)}
                            style={{ padding:"4px 10px", fontSize:12, background:"#f0fdf4", color:"#15803d",
                              border:"1px solid #bbf7d0", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
                            ✅ รับแล้ว
                          </button>
                        </>
                      )}
                      <button onClick={()=>deleteMail(mail.id)}
                        style={{ padding:"4px 8px", fontSize:11, background:"#fafafa", color:"#94a3b8",
                          border:"1px solid #e2e8f0", borderRadius:6, cursor:"pointer" }}>
                        ลบ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// ── main app ──────────────────────────────────────────────────────────────────
function ApartmentApp({ onLogout }) {
  const [settings, setSettings] = useState(() => load("apt_settings", INIT_SETTINGS));
  const [rooms, setRooms] = useState(() => load("apt_rooms", INIT_ROOMS));
  const [tab, setTab] = useState("batch");
  const [mails, setMails] = useState(() => load("apt_mails", []));
  const [remindDays, setRemindDays] = useState(() => load("apt_remindDays", 3));
  const [photos, setPhotos] = useState([]);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  // persist to localStorage whenever state changes
  useEffect(() => save("apt_settings", settings), [settings]);
  useEffect(() => save("apt_rooms", rooms), [rooms]);
  useEffect(() => save("apt_mails", mails), [mails]);
  useEffect(() => save("apt_remindDays", remindDays), [remindDays]);

  const updateSetting = (k,v) => setSettings(s=>({...s,[k]:v}));
  const updateRoom = (room,key,val) => setRooms(rs=>rs.map(r=>r.room===room?{...r,[key]:val}:r));
  const togglePaid = (room) => setRooms(rs=>rs.map(r=>r.room===room?{...r,paid:!r.paid}:r));

  const processFiles = useCallback(async (files) => {
    const imgs = Array.from(files).filter(f=>f.type.startsWith("image/"));
    if (!imgs.length) return;
    const newItems = imgs.map(f=>({ id:++idCounter, file:f, preview:URL.createObjectURL(f), status:"reading", reading:null, confidence:null, assigned:false }));
    setPhotos(prev=>[...prev,...newItems]);
    for (let i=0; i<newItems.length; i+=5) {
      const batch = newItems.slice(i,i+5);
      await Promise.all(batch.map(async item => {
        try {
          const b64 = await fileToBase64(item.file);
          const result = await readMeterPhoto(b64, item.file.type);
          setPhotos(prev=>prev.map(p=>p.id===item.id?{...p,status:"done",reading:result.reading,confidence:result.confidence}:p));
        } catch {
          setPhotos(prev=>prev.map(p=>p.id===item.id?{...p,status:"done",reading:null,confidence:"error"}:p));
        }
      }));
    }
  }, []);

  const handleDrop = useCallback(e=>{ e.preventDefault(); setDragOver(false); processFiles(e.dataTransfer.files); },[processFiles]);
  const assignPhoto = (id,room,type,reading) => { updateRoom(room,type,String(reading)); setPhotos(prev=>prev.map(p=>p.id===id?{...p,assigned:true}:p)); };
  const manualReading = (id,val) => setPhotos(prev=>prev.map(p=>p.id===id?{...p,reading:val}:p));
  const removePhoto = (id) => setPhotos(prev=>prev.filter(p=>p.id!==id));
  const clearAssigned = () => setPhotos(prev=>prev.filter(p=>!p.assigned));
  const printAll = () => { const w=window.open("","_blank"); w.document.write(generatePrintHTML(rooms,settings)); w.document.close(); w.print(); };

  const filled = rooms.filter(r=>r.name||r.currWater||r.currElec).length;
  const paidCount = rooms.filter(r=>r.paid).length;
  const totalDue = rooms.reduce((acc,r)=>{ if(!r.name&&!r.currWater&&!r.currElec) return acc; return acc+roomTotal(r,settings); },0);
  const filteredRooms = rooms.filter(r=>r.room.includes(search)||r.name.toLowerCase().includes(search.toLowerCase()));
  const unassigned = photos.filter(p=>!p.assigned).length;
  const done = photos.filter(p=>p.status==="done").length;

  const tabs = [
    ["batch","📷 มิเตอร์"],
    ["slip","🧾 ตรวจสลิป"],
    ["payment","💰 ติดตามการจ่าย"],
    ["mail","📬 ติดตามไปรษณีย์"],
    ["entry","📋 ข้อมูลห้อง"],
    ["settings","⚙️ ตั้งค่า"],
  ];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.logo}>🏢 ระบบจัดการอพาร์ตเมนต์</div>
          <div style={S.tagline}>{settings.buildingName} · {settings.month}</div>
        </div>
        <div style={S.statsRow}>
          <Stat num={`${filled}/162`} label="ห้องที่กรอกแล้ว" />
          <Stat num={`${paidCount}/${filled}`} label="จ่ายแล้ว" color="#22c55e" />
          <Stat num={`฿${fmt(totalDue)}`} label="ยอดรวม" color="#f59e0b" />
          <button onClick={onLogout} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.3)", color:"white", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, marginLeft:8 }}>ออกจากระบบ</button>
        </div>
      </div>

      <div style={S.nav}>
        {tabs.map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ ...S.navBtn, ...(tab===id?S.navActive:{}) }}>
            {lbl}
            {id==="batch"&&photos.length>0&&<span style={S.navBadge}>{unassigned}</span>}
            {id==="mail"&&mails.filter(m=>m.status!=="picked").length>0&&<span style={{...S.navBadge,background:"#7c3aed"}}>{mails.filter(m=>m.status!=="picked").length}</span>}
          </button>
        ))}
        <button onClick={printAll} style={S.btnPrint}>🖨️ พิมพ์ทั้งหมด</button>
      </div>

      <div style={S.content}>

        {/* BATCH METER UPLOAD */}
        {tab==="batch" && (
          <div>
            <div style={{ ...S.dropZone, ...(dragOver?S.dropActive:{}) }}
              onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
              onDrop={handleDrop} onClick={()=>fileRef.current.click()}>
              <div style={{ fontSize:36, marginBottom:8 }}>📂</div>
              <div style={{ fontWeight:700, fontSize:16, color:"#1a1a2e" }}>วางรูปมิเตอร์ทั้งหมดที่นี่</div>
              <div style={{ color:"#64748b", fontSize:13, marginTop:4 }}>หรือคลิกเพื่อเลือกไฟล์ · รองรับหลายรูปพร้อมกัน</div>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>processFiles(e.target.files)} />
            </div>
            {photos.length>0 && (
              <div style={S.progressBox}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:14, color:"#475569" }}>อ่านแล้ว {done}/{photos.length} รูป · รอบันทึก {unassigned} รูป</span>
                  <button onClick={clearAssigned} style={S.btnClear}>ลบรูปที่บันทึกแล้ว</button>
                </div>
                <div style={{ background:"#e2e8f0", borderRadius:99, height:6 }}>
                  <div style={{ background:"#22c55e", borderRadius:99, height:6, width:`${photos.length?(done/photos.length)*100:0}%`, transition:"width 0.3s" }} />
                </div>
              </div>
            )}
            {photos.length>0
              ? <div style={S.photoGrid}>{photos.map(item=><MeterPhotoCard key={item.id} item={item} rooms={rooms} onAssign={assignPhoto} onManualReading={manualReading} onRemove={removePhoto} />)}</div>
              : <div style={{ textAlign:"center", color:"#94a3b8", padding:"40px 0", fontSize:14 }}>ยังไม่มีรูปมิเตอร์ · อัพโหลดด้านบนเพื่อเริ่มต้น</div>
            }
          </div>
        )}

        {/* SLIP VERIFIER */}
        {tab==="slip" && <SlipVerifier rooms={rooms} settings={settings} />}

        {/* PAYMENT TRACKER */}
        {tab==="payment" && <PaymentTracker rooms={rooms} settings={settings} onTogglePaid={togglePaid} />}

        {/* ROOM ENTRY */}
        {tab==="entry" && (
          <div style={S.card}>
            <div style={{ display:"flex", gap:12, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหาห้องหรือชื่อผู้เช่า" style={{ ...S.inputFull, maxWidth:260 }} />
              <span style={{ color:"#94a3b8", fontSize:13 }}>แสดง {filteredRooms.length} ห้อง</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", minWidth:800 }}>
                <thead><tr style={{ background:"#1a1a2e", color:"white" }}>
                  {["ห้อง","ชื่อผู้เช่า","น้ำ: ก่อน","น้ำ: หลัง","ไฟ: ก่อน","ไฟ: หลัง","จอดรถ","ค่าน้ำ","ค่าไฟ","ค่าจอด","รวม","จ่ายแล้ว"].map(h=>(
                    <th key={h} style={{ padding:"10px", textAlign:"left", fontSize:12, fontWeight:600 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredRooms.map((r,i)=>{
                    const usedW=Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
                    const usedE=Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
                    const waterFee=usedW*settings.waterRate, elecFee=usedE*settings.elecRate;
                    const pFee=parkingFee(r,settings);
                    const total=settings.rent+waterFee+elecFee+pFee;
                    return (
                      <tr key={r.id} style={{ background:i%2===0?"white":"#fafafa", borderBottom:"1px solid #f0f0f0" }}>
                        <td style={S.td}><span style={S.roomBadge}>{r.room}</span></td>
                        <td style={S.td}><input value={r.name} onChange={e=>updateRoom(r.room,"name",e.target.value)} placeholder="ชื่อ" style={S.inputRow} /></td>
                        {["prevWater","currWater","prevElec","currElec"].map(k=>(
                          <td key={k} style={S.td}><input value={r[k]} type="number" onChange={e=>updateRoom(r.room,k,e.target.value)} placeholder="-" style={{ ...S.inputRow, width:72 }} /></td>
                        ))}
                        <td style={S.td}>
                          <select value={r.parking} onChange={e=>updateRoom(r.room,"parking",e.target.value)} style={{ ...S.inputRow, width:90, fontSize:12 }}>
                            <option value="">ไม่มี</option>
                            <option value="moto">🏍️ มอไซค์</option>
                            <option value="car">🚗 รถยนต์</option>
                            <option value="both">🏍️🚗 ทั้งคู่</option>
                          </select>
                          {r.parking && <input value={r.parkingOverride} type="number" onChange={e=>updateRoom(r.room,"parkingOverride",e.target.value)} placeholder={`฿${pFee}`} title="แก้ไขค่าจอดพิเศษ" style={{ ...S.inputRow, width:72, marginTop:3, fontSize:11, color:"#64748b" }} />}
                        </td>
                        <td style={{ ...S.td, textAlign:"right", color:"#475569" }}>฿{fmt(waterFee)}</td>
                        <td style={{ ...S.td, textAlign:"right", color:"#475569" }}>฿{fmt(elecFee)}</td>
                        <td style={{ ...S.td, textAlign:"right", color:"#7c3aed" }}>{pFee>0?`฿${fmt(pFee)}`:"-"}</td>
                        <td style={{ ...S.td, textAlign:"right", fontWeight:700 }}>฿{fmt(total)}</td>
                        <td style={S.td}>
                          <button onClick={()=>togglePaid(r.room)}
                            style={{ ...S.toggleBtn, ...(r.paid?S.togglePaid:S.toggleUnpaid), padding:"3px 8px", fontSize:12 }}>
                            {r.paid?"✅":"⏳"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab==="mail" && <MailTracker rooms={rooms} mails={mails} setMails={setMails} remindDays={remindDays} setRemindDays={setRemindDays} buildingName={settings.buildingName} />}

        {tab==="settings" && (
          <div style={S.card}>
            <h2 style={S.cardTitle}>⚙️ ตั้งค่า</h2>
            <p style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>ข้อมูลเจ้าของและอัตราค่าใช้จ่าย ใช้สำหรับตรวจสอบสลิปและออกใบแจ้งหนี้</p>
            <div style={S.settingsGrid}>
              {[
                ["ชื่ออาคาร","buildingName","text"],
                ["ชื่อเจ้าของ (สำหรับตรวจสลิป)","ownerName","text"],
                ["ชื่อธนาคาร","bankName","text"],
                ["เลขบัญชี","accountNumber","text"],
                ["ค่าเช่า (฿/ห้อง)","rent","number"],
                ["ค่าน้ำ (฿/หน่วย)","waterRate","number"],
                ["ค่าไฟ (฿/หน่วย)","elecRate","number"],
                ["ค่าจอด มอเตอร์ไซค์ (฿/เดือน)","parkingMoto","number"],
                ["ค่าจอด รถยนต์ (฿/เดือน)","parkingCar","number"],
                ["เดือนที่เรียกเก็บ","month","text"],
              ].map(([label,key,type])=>(
                <label key={key} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"#475569" }}>{label}</span>
                  <input type={type} value={settings[key]} onChange={e=>updateSetting(key,type==="number"?parseFloat(e.target.value)||0:e.target.value)} style={S.inputFull} />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => load("apt_auth", false));
  const logout = () => { save("apt_auth", false); setAuthed(false); };
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
  return <ApartmentApp onLogout={logout} />;
}

function Stat({ num, label, color }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
      <span style={{ fontSize:20, fontWeight:700, color:color||"white" }}>{num}</span>
      <span style={{ fontSize:11, color:"#94a3b8" }}>{label}</span>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────
const S = {
  page:{ minHeight:"100vh", background:"#f8fafc", fontFamily:"'Sarabun','Tahoma',sans-serif" },
  header:{ background:"#1a1a2e", color:"white", padding:"18px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 },
  logo:{ fontSize:20, fontWeight:700 }, tagline:{ fontSize:13, color:"#94a3b8", marginTop:2 },
  statsRow:{ display:"flex", gap:24 },
  nav:{ background:"white", borderBottom:"1px solid #e2e8f0", padding:"0 16px", display:"flex", alignItems:"center", flexWrap:"wrap", gap:2 },
  navBtn:{ padding:"12px 14px", border:"none", background:"transparent", cursor:"pointer", fontSize:13, color:"#64748b", borderBottom:"3px solid transparent", position:"relative" },
  navActive:{ color:"#1a1a2e", fontWeight:700, borderBottom:"3px solid #f59e0b" },
  navBadge:{ position:"absolute", top:6, right:2, background:"#ef4444", color:"white", borderRadius:99, fontSize:10, padding:"1px 5px", fontWeight:700 },
  btnPrint:{ marginLeft:"auto", padding:"7px 16px", background:"#f59e0b", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:13 },
  btnPrimary:{ padding:"10px 20px", background:"#1a1a2e", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:14 },
  btnClear:{ padding:"5px 12px", background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0", borderRadius:6, cursor:"pointer", fontSize:12 },
  content:{ padding:"20px 24px", maxWidth:1280, margin:"0 auto" },
  card:{ background:"white", borderRadius:12, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.07)", marginBottom:16 },
  cardTitle:{ fontSize:16, fontWeight:700, color:"#1a1a2e", marginBottom:8 },
  dropZone:{ border:"2px dashed #cbd5e1", borderRadius:12, padding:"36px 24px", textAlign:"center", cursor:"pointer", background:"white", marginBottom:16, transition:"all 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" },
  dropActive:{ borderColor:"#f59e0b", background:"#fffbeb" },
  slipDrop:{ border:"2px dashed #cbd5e1", borderRadius:10, padding:"20px", textAlign:"center", cursor:"pointer", background:"#f8fafc", minHeight:80, display:"flex", alignItems:"center", justifyContent:"center" },
  progressBox:{ background:"white", borderRadius:10, padding:"14px 16px", marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  photoGrid:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:14 },
  photoCard:{ background:"white", borderRadius:10, overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.08)", display:"flex", flexDirection:"column" },
  photoImg:{ width:"100%", height:110, objectFit:"cover", display:"block" },
  badge:{ position:"absolute", top:6, left:6, color:"white", fontSize:11, padding:"2px 7px", borderRadius:99, fontWeight:700 },
  removeBtn:{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.5)", color:"white", border:"none", borderRadius:99, width:20, height:20, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center" },
  inputTiny:{ padding:"5px 7px", border:"1px solid #e2e8f0", borderRadius:6, fontSize:13, outline:"none", width:"100%", marginBottom:2 },
  applyBtn:{ padding:"6px", background:"#1a1a2e", color:"white", border:"none", borderRadius:7, cursor:"pointer", fontSize:13, fontWeight:600 },
  applyDisabled:{ background:"#e2e8f0", color:"#94a3b8", cursor:"not-allowed" },
  settingsGrid:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:16 },
  inputFull:{ padding:"8px 10px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:14, outline:"none", width:"100%" },
  fieldLabel:{ fontSize:13, fontWeight:600, color:"#475569" },
  expectedBox:{ display:"flex", flexDirection:"column", gap:2, background:"#f8fafc", padding:"10px 12px", borderRadius:8, marginTop:8 },
  infoGrid:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:10, marginBottom:12 },
  infoCell:{ background:"white", padding:"8px 12px", borderRadius:8 },
  flagsBox:{ background:"#fef3c7", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", marginBottom:8 },
  td:{ padding:"7px 10px", verticalAlign:"middle" },
  roomBadge:{ background:"#f1f5f9", padding:"3px 8px", borderRadius:6, fontSize:12, fontWeight:700, color:"#334155" },
  inputRow:{ padding:"4px 7px", border:"1px solid #e2e8f0", borderRadius:6, fontSize:13, outline:"none", width:"100%" },
  filterBtn:{ padding:"7px 14px", border:"1px solid #e2e8f0", borderRadius:8, cursor:"pointer", fontSize:13, background:"white", color:"#64748b" },
  filterActive:{ background:"#1a1a2e", color:"white", border:"1px solid #1a1a2e" },
  statCard:{ background:"white", borderRadius:10, padding:"12px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  roomCard:{ borderRadius:10, padding:"12px", display:"flex", flexDirection:"column", gap:4 },
  roomPaid:{ background:"#f0fdf4", border:"1px solid #bbf7d0" },
  roomUnpaid:{ background:"white", border:"1px solid #e2e8f0" },
  toggleBtn:{ marginTop:4, padding:"5px 10px", border:"none", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600 },
  togglePaid:{ background:"#dcfce7", color:"#15803d" },
  toggleUnpaid:{ background:"#f1f5f9", color:"#475569" },
};
