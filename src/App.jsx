import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { fetchRooms, fetchSettings, saveRoom, saveAllRooms, saveSettings, subscribeRooms, subscribeSettings } from "./supabaseSync";

// load EmailJS SDK once
if (!window._emailjsLoaded) {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
  s.onload = () => { window.emailjs.init(EMAILJS_PUBLIC_KEY); window._emailjsLoaded = true; };
  document.head.appendChild(s);
}

// ── auth ─────────────────────────────────────────────────────────────────────
const APP_PASSWORD = "apartment2024"; // ← change this to your password

// ── EmailJS config (fill these in after setting up EmailJS) ──────────────────
const EMAILJS_SERVICE_ID  = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "YOUR_PUBLIC_KEY";
const BACKUP_EMAIL        = "YOUR_APARTMENT_EMAIL@gmail.com";

function LoginScreen({ onLogin }) {
  const [step, setStep]     = useState("login"); // "login" | "nickname"
  const [email, setEmail]   = useState("");
  const [pw, setPw]         = useState("");
  const [nickname, setNick] = useState("");
  const [error, setError]   = useState("");
  const [show, setShow]     = useState(false);
  const [busy, setBusy]     = useState(false);

  const attemptLogin = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      setPw("");
    } else {
      setStep("nickname");
    }
  };

  const attemptNickname = () => {
    const name = nickname.trim() || "Admin";
    sessionStorage.setItem("apt_admin", name);
    onLogin(name);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Sarabun','Tahoma',sans-serif" }}>
      <div style={{ background:"white", borderRadius:16, padding:"40px 36px", width:360, boxShadow:"0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🏢</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#0f172a" }}>ศิริสุขแมนชั่น</div>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>
            {step==="login" ? "เข้าสู่ระบบผู้ดูแล" : "ระบุชื่อผู้ดูแลระบบ"}
          </div>
        </div>

        {step === "login" && (
          <>
            <input type="email" value={email}
              onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&attemptLogin()}
              placeholder="อีเมล" autoFocus
              style={{ width:"100%", padding:"12px 14px", border:`2px solid ${error?"#ef4444":"#e2e8f0"}`, borderRadius:10, fontSize:15, outline:"none", boxSizing:"border-box", marginBottom:10 }}
            />
            <div style={{ position:"relative", marginBottom:12 }}>
              <input type={show?"text":"password"} value={pw}
                onChange={e=>setPw(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&attemptLogin()}
                placeholder="รหัสผ่าน"
                style={{ width:"100%", padding:"12px 44px 12px 14px", border:`2px solid ${error?"#ef4444":"#e2e8f0"}`, borderRadius:10, fontSize:15, outline:"none", boxSizing:"border-box" }}
              />
              <button onClick={()=>setShow(s=>!s)}
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8" }}>
                {show?"🙈":"👁️"}
              </button>
            </div>
            {error && <div style={{ color:"#ef4444", fontSize:13, marginBottom:8, textAlign:"center" }}>{error}</div>}
            <button onClick={attemptLogin} disabled={busy||!email||!pw}
              style={{ width:"100%", padding:"12px", background:busy||!email||!pw?"#94a3b8":"#0f172a", color:"white", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:busy?"wait":"pointer" }}>
              {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </>
        )}

        {step === "nickname" && (
          <>
            <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#15803d" }}>
              ✅ เข้าสู่ระบบสำเร็จ
            </div>
            <label style={{ fontSize:13, fontWeight:600, color:"#475569", display:"block", marginBottom:6 }}>
              ชื่อ / ชื่อเล่น (สำหรับบันทึกการแก้ไข)
            </label>
            <input value={nickname} onChange={e=>setNick(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&attemptNickname()}
              placeholder="เช่น แม่, เคด, สตาฟ..." autoFocus
              style={{ width:"100%", padding:"12px 14px", border:"2px solid #e2e8f0", borderRadius:10, fontSize:15, outline:"none", boxSizing:"border-box", marginBottom:12 }}
            />
            <button onClick={attemptNickname}
              style={{ width:"100%", padding:"12px", background:"#0f172a", color:"white", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer" }}>
              เข้าใช้งาน
            </button>
          </>
        )}
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
const ROOM_NUMBERS = [
  ...Array.from({ length: 18 }, (_, i) => `2${2}${String(i+1).padStart(2,"0")}`), // floor 2: 18 rooms
  ...Array.from({ length: 18 }, (_, i) => `2${3}${String(i+1).padStart(2,"0")}`), // floor 3
  ...Array.from({ length: 18 }, (_, i) => `2${4}${String(i+1).padStart(2,"0")}`), // floor 4
  ...Array.from({ length: 18 }, (_, i) => `2${5}${String(i+1).padStart(2,"0")}`), // floor 5
  ...Array.from({ length: 18 }, (_, i) => `2${6}${String(i+1).padStart(2,"0")}`), // floor 6
  ...Array.from({ length: 18 }, (_, i) => `2${7}${String(i+1).padStart(2,"0")}`), // floor 7
  ...Array.from({ length: 18 }, (_, i) => `2${8}${String(i+1).padStart(2,"0")}`), // floor 8
  ...Array.from({ length: 14 }, (_, i) => `2${9}${String(i+1).padStart(2,"0")}`), // floor 9: 14 rooms
];
const INIT_SETTINGS = { buildingName:"สิริสุขแมนชั่น", ownerName:"ปวเรศ เมธากุลวรา", bankName:"", accountNumber:"", waterRate:18, elecRate:8, lineChannelToken:"", lineRoomPassword:"sirisuk2025", month:new Date().toLocaleString("th-TH",{month:"long",year:"numeric"}) };
// Per-room: rent, parking, furniture, wifi — all numeric, persistent. lineUserId for LINE push.
const INIT_ROOMS = ROOM_NUMBERS.map((room,i) => ({ id:i+1, room, name:"", prevWater:"", currWater:"", prevElec:"", currElec:"", rent:"", parking:"", furniture:"", wifi:"", lineUserId:"", paid:false, paidAmount:null, paidDate:null, slipStatus:null }));

function fileToBase64(file) {
  return new Promise((res,rej) => { const r=new FileReader(); r.onload=e=>res(e.target.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
}

// Per-room fee helpers — values stored directly on each room object
function roomRent(r)      { return parseFloat(r.rent)      || 0; }
function parkingFee(r)    { return parseFloat(r.parking)   || 0; }
function furnitureFee(r)  { return parseFloat(r.furniture) || 0; }
function wifiFee(r)        { return parseFloat(r.wifi)       || 0; }
function roomTotal(r, settings) {
  const usedW = Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
  const usedE = Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
  return roomRent(r) + usedW*settings.waterRate + usedE*settings.elecRate + parkingFee(r) + furnitureFee(r) + wifiFee(r);
}

// ── AI: read meter ────────────────────────────────────────────────────────────
async function readMeterPhoto(base64, mediaType) {
  const res = await fetch("/.netlify/functions/ai-proxy", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:150,
      messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:mediaType, data:base64 }},
        { type:"text", text:`You are reading utility meter photos for Sirisuk Mansion apartment building in Thailand.

TASK 1 - FIND ROOM NUMBER:
Look EVERYWHERE in the image for a white rectangular sticker/label with a 4-digit number.
- The number will be between 2201 and 2918
- It is handwritten or printed in blue/black ink on a white sticker
- It could be at the TOP, CENTER, or BOTTOM of the meter
- It could be on the meter face, on the pipe, or on the wall nearby
- Examples: 2605, 2307, 2914, 2801, 2412
- Look very carefully - do not miss it!

TASK 2 - READ METER NUMBER:
- For digital display: read the numbers shown on the roller/counter (e.g. 1650, 32204)
- For analog dial: read the main large display only, use HIGHER number if between two numbers
- Ignore small sub-dials labeled x0.1 or x0.001

Reply ONLY with JSON, no markdown, no explanation:
{"reading": 1650, "room": "2605", "confidence": "high"}

confidence = "high" if sure, "low" if uncertain
room = null if no sticker found
reading = null if cannot read meter` }
      ]}]
    })
  });
  const data = await res.json();
  const text = data.content?.map(b=>b.text||"").join("") || "";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return { reading:null, room:null, confidence:"error" }; }
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

  const res = await fetch("/.netlify/functions/ai-proxy", {
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
  const ownerName = settings.ownerName || "ปวเรศ เมธากุลวรา";
  const billsHTML = bills.map(r => {
    const usedW    = Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
    const usedE    = Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
    const waterFee = usedW*settings.waterRate;
    const elecFee  = usedE*settings.elecRate;
    const rRent    = roomRent(r);
    const pFee     = parkingFee(r);
    const fFee     = furnitureFee(r);
    const wFee2    = wifiFee(r);
    const total    = rRent + waterFee + elecFee + pFee + fFee + wFee2;
    return `<div class="bill">
      <div class="bh">
        <div class="bn">${settings.buildingName}</div>
        <div class="bt">ใบแจ้งหนี้ค่าเช่าและค่าบริการ</div>
        <div class="bm">
          <span>ห้อง: <strong>${r.room}</strong></span>
          <span>ผู้เช่า: <strong>${r.name||"-"}</strong></span>
          <span>ประจำเดือน: <strong>${settings.month}</strong></span>
          <span>วันที่ออก: ${today()}</span>
        </div>
      </div>
      <table>
        <thead><tr><th>รายการ</th><th>ก่อน</th><th>หลัง</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>รวม</th></tr></thead>
        <tbody>
          ${rRent>0?`<tr><td>ค่าเช่าห้อง</td><td>-</td><td>-</td><td>-</td><td>-</td><td>฿${f(rRent)}</td></tr>`:""}
          <tr><td>ค่าน้ำประปา</td><td>${r.prevWater||0}</td><td>${r.currWater||0}</td><td>${usedW} หน่วย</td><td>฿${settings.waterRate}</td><td>฿${f(waterFee)}</td></tr>
          <tr><td>ค่าไฟฟ้า</td><td>${r.prevElec||0}</td><td>${r.currElec||0}</td><td>${usedE} หน่วย</td><td>฿${settings.elecRate}</td><td>฿${f(elecFee)}</td></tr>
          ${pFee>0?`<tr><td>ค่าที่จอดรถ</td><td>-</td><td>-</td><td>-</td><td>-</td><td>฿${f(pFee)}</td></tr>`:""}
          ${fFee>0?`<tr><td>ค่าเช่าเฟอร์นิเจอร์</td><td>-</td><td>-</td><td>-</td><td>-</td><td>฿${f(fFee)}</td></tr>`:""}
          ${wFee2>0?`<tr><td>ค่าบริการ WiFi</td><td>-</td><td>-</td><td>-</td><td>-</td><td>฿${f(wFee2)}</td></tr>`:""}
        </tbody>
        <tfoot><tr class="tr"><td colspan="5"><strong>ยอดรวมที่ต้องชำระทั้งสิ้น</strong></td><td>฿${f(total)}</td></tr></tfoot>
      </table>
      <div class="pay">
        <div class="pay-t">ช่องทางการชำระเงิน</div>
        <div class="pay-r">
          ${settings.bankName?`<span>🏦 ${settings.bankName}</span>`:""}
          ${settings.accountNumber?`<span>เลขที่บัญชี: <strong>${settings.accountNumber}</strong></span>`:""}
          <span>ชื่อบัญชี: <strong>${ownerName}</strong></span>
        </div>
      </div>
      <div class="bf">รบกวนชำระเงินไม่เกินวันที่ 5 ของเดือน (หากเกินกำหนด มีค่าปรับวันละ 100 บาท) เพื่อความปลอดภัย กรุณาตรวจสอบชื่อและเลขบัญชีให้ถูกต้องก่อนโอนเงิน ศิริสุข แมนชั่น มีเพียงบัญชีนี้บัญชีเดียวเท่านั้น โปรดระวังผู้แอบอ้างและมิจฉาชีพค่ะ/ครับ</div>
    </div>`;
  }).join("");
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Sarabun','Tahoma',sans-serif;font-size:13px;background:#f5f5f5}
    .bill{width:148mm;background:white;margin:6mm auto;padding:8mm;border:1px solid #ccc;page-break-after:always;border-radius:4px}
    .bh{margin-bottom:8px}
    .bn{font-size:18px;font-weight:800;color:#0f172a;text-align:center}
    .bt{font-size:12px;color:#64748b;text-align:center;margin-bottom:5px}
    .bm{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;background:#f8fafc;padding:5px 8px;border-radius:4px;margin-bottom:8px;color:#334155}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#0f172a;color:white;padding:6px 7px;text-align:left}
    td{padding:5px 7px;border-bottom:1px solid #f0f0f0}
    td:not(:first-child){text-align:center}td:last-child{text-align:right;font-weight:600}
    .tr{background:#0f172a}.tr td{color:white;font-weight:700;border:none;font-size:13px}
    .tr td:last-child{color:#fbbf24;font-size:15px}
    .pay{background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;padding:7px 9px;margin:8px 0;font-size:12px}
    .pay-t{font-weight:700;color:#0369a1;font-size:11px;margin-bottom:3px}
    .pay-r{display:flex;flex-wrap:wrap;gap:10px;color:#0c4a6e}
    .bf{font-size:10.5px;color:#334155;margin-top:7px;padding:8px 10px;background:#fff9f0;border:1px solid #fde68a;border-radius:5px;line-height:1.65}
    @media print{body{background:white}.bill{margin:0;border-radius:0;box-shadow:none;page-break-after:always}}
  </style></head><body>${billsHTML}</body></html>`;
}

// ── PhotoCard (meter) ─────────────────────────────────────────────────────────
let idCounter = 0;
function MeterPhotoCard({ item, rooms, onAssign, onManualReading, onRemove }) {
  const [room, setRoom] = useState(item.room || "");
  // auto-apply if room and reading both detected
  useEffect(() => {
    if (item.room && item.reading && !item.assigned) {
      setRoom(item.room);
    }
  }, [item.room, item.reading]);
  const defaultType = item.meterType === "water" ? "currWater" : "currElec";
  const [type, setType] = useState(defaultType);
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
        <input
          list={`rooms-${item.id}`}
          value={room}
          onChange={e=>setRoom(e.target.value)}
          placeholder="พิมพ์เลขห้อง..."
          style={{...S.inputTiny, width:"100%"}}
        />
        <datalist id={`rooms-${item.id}`}>
          {rooms.map(r=><option key={r.room} value={r.room}>{r.name?`${r.room} · ${r.name}`:r.room}</option>)}
        </datalist>
        <div style={{fontSize:11,color:"#64748b",padding:"3px 0"}}>
          ประเภท: <strong style={{color:item.meterType==="water"?"#1d4ed8":"#854d0e"}}>{item.meterType==="water"?"💧 น้ำ – หลัง":"⚡ ไฟ – หลัง"}</strong>
        </div>
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
              {parkingFee(r)>0 && <div style={{ fontSize:11, color:"#7c3aed" }}>🅿️ จอดรถ ฿{fmt(parkingFee(r))}</div>}
              {furnitureFee(r)>0 && <div style={{ fontSize:11, color:"#0ea5e9" }}>🛋️ เฟอร์นิเจอร์ ฿{fmt(furnitureFee(r))}</div>}
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
function ApartmentApp({ onLogout, adminName = "Admin" }) {
  const [settings, setSettings] = useState(INIT_SETTINGS);
  const [rooms, setRooms] = useState(INIT_ROOMS);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState(() => load("apt_history", []));
  const [tab, setTab] = useState("batch");
  const [mails, setMails] = useState(() => load("apt_mails", []));
  const [repairs, setRepairs] = useState(() => load("apt_repairs", []));
  const [remindDays, setRemindDays] = useState(() => load("apt_remindDays", 3));
  const [photos, setPhotos] = useState([]);
  const [meterType, setMeterType] = useState("elec"); // "elec" | "water"
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  // persist to localStorage whenever state changes
  // ── Supabase: initial load + realtime sync (replaces localStorage for rooms/settings) ──
  useEffect(() => {
    let roomSub, settingsSub;
    (async () => {
      try {
        const [dbRooms, dbSettings] = await Promise.all([fetchRooms(), fetchSettings()]);
        // merge db rooms over INIT_ROOMS so any missing room still renders
        setRooms(prev => prev.map(r => dbRooms.find(d => d.room === r.room) || r));
        setSettings(s => ({ ...s, ...dbSettings }));
      } catch (e) {
        console.error("Supabase load failed:", e.message);
      } finally {
        setLoading(false);
      }
      // realtime: when ANY admin changes a room, patch just that room in place
      roomSub = subscribeRooms((updated) => {
        setRooms(prev => prev.map(r => r.room === updated.room ? updated : r));
      });
      settingsSub = subscribeSettings((updated) => {
        setSettings(s => ({ ...s, ...updated }));
      });
    })();
    return () => {
      if (roomSub) supabase.removeChannel(roomSub);
      if (settingsSub) supabase.removeChannel(settingsSub);
    };
  }, []);
  useEffect(() => save("apt_history", history), [history]);
  useEffect(() => save("apt_mails", mails), [mails]);
  useEffect(() => save("apt_repairs", repairs), [repairs]);
  useEffect(() => save("apt_remindDays", remindDays), [remindDays]);

  const updateSetting = (k,v) => setSettings(s=>{ const next={...s,[k]:v}; saveSettings(next); return next; });
  const stamp = () => ({ updatedBy: adminName, updatedAt: new Date().toLocaleString("th-TH") });
  const updateRoom = (room,key,val) => setRooms(rs=>rs.map(r=>{
    if (r.room!==room) return r;
    const updated = {...r,[key]:val,...stamp()};
    saveRoom(updated);
    return updated;
  }));
  const togglePaid = (room) => setRooms(rs=>rs.map(r=>{
    if (r.room!==room) return r;
    const updated = {...r,paid:!r.paid,...stamp()};
    saveRoom(updated);
    return updated;
  }));

  const processFiles = useCallback(async (files) => {
    const imgs = Array.from(files).filter(f=>f.type.startsWith("image/"));
    if (!imgs.length) return;
    const newItems = imgs.map(f=>({ id:++idCounter, file:f, preview:URL.createObjectURL(f), status:"reading", reading:null, room:null, confidence:null, assigned:false, autoAssigned:false, meterType }));
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
  const printRoom = (room) => { const w=window.open("","_blank"); w.document.write(generatePrintHTML([room],settings)); w.document.close(); w.print(); };

  const filled = rooms.filter(r=>r.name||r.currWater||r.currElec).length;
  const paidCount = rooms.filter(r=>r.paid).length;
  const totalDue = rooms.reduce((acc,r)=>{ if(!r.name&&!r.currWater&&!r.currElec) return acc; return acc+roomTotal(r,settings); },0);
  const filteredRooms = rooms.filter(r=>r.room.includes(search)||r.name.toLowerCase().includes(search.toLowerCase()));
  const unassigned = photos.filter(p=>!p.assigned).length;
  const done = photos.filter(p=>p.status==="done").length;

  const exportToExcel = (snap) => {
    const s = snap || { rooms, settings, month: settings.month };
    const year = new Date().getFullYear().toString();

    // Build rows
    const rows = s.rooms
      .filter(r => r.name || r.currWater || r.currElec)
      .map(r => {
        const usedW = Math.max(0, (parseFloat(r.currWater)||0) - (parseFloat(r.prevWater)||0));
        const usedE = Math.max(0, (parseFloat(r.currElec)||0) - (parseFloat(r.prevElec)||0));
        const wFee  = usedW * s.settings.waterRate;
        const eFee  = usedE * s.settings.elecRate;
        const pFee  = parkingFee(r);
        const total = roomRent(r) + wFee + eFee + pFee + furnitureFee(r);
        return {
          "ห้อง": r.room,
          "ชื่อผู้เช่า": r.name || "-",
          "มิเตอร์น้ำ (ก่อน)": parseFloat(r.prevWater) || 0,
          "มิเตอร์น้ำ (หลัง)": parseFloat(r.currWater) || 0,
          "หน่วยน้ำ": usedW,
          "ค่าน้ำ (฿)": wFee,
          "มิเตอร์ไฟ (ก่อน)": parseFloat(r.prevElec) || 0,
          "มิเตอร์ไฟ (หลัง)": parseFloat(r.currElec) || 0,
          "หน่วยไฟ": usedE,
          "ค่าไฟ (฿)": eFee,
          "ค่าจอดรถ (฿)": pFee || 0,
          "ค่าเช่าเฟอร์นิเจอร์ (฿)": furnitureFee(r) || 0,
          "ค่า WiFi (฿)": wifiFee(r) || 0,
          "ค่าเช่าห้อง (฿)": roomRent(r),
          "รวม (฿)": total,
          "สถานะการจ่าย": r.paid ? "จ่ายแล้ว" : "ยังไม่จ่าย",
        };
      });

    // Summary row
    const totalRevenue = rows.reduce((acc, r) => acc + r["รวม (฿)"], 0);
    const paidCount = rows.filter(r => r["สถานะการจ่าย"] === "จ่ายแล้ว").length;
    rows.push({});
    rows.push({
      "ห้อง": "สรุป",
      "ชื่อผู้เช่า": `${rows.length - 2} ห้อง`,
      "ค่าน้ำ (฿)": rows.slice(0,-2).reduce((a,r)=>a+(r["ค่าน้ำ (฿)"]||0),0),
      "ค่าไฟ (฿)": rows.slice(0,-2).reduce((a,r)=>a+(r["ค่าไฟ (฿)"]||0),0),
      "ค่าจอด (฿)": rows.slice(0,-2).reduce((a,r)=>a+(r["ค่าจอด (฿)"]||0),0),
      "ค่าเช่า (฿)": rows.slice(0,-2).reduce((a,r)=>a+(r["ค่าเช่า (฿)"]||0),0),
      "รวม (฿)": totalRevenue,
      "สถานะการจ่าย": `จ่ายแล้ว ${paidCount} ห้อง`,
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      {wch:8},{wch:16},{wch:14},{wch:14},{wch:10},{wch:12},
      {wch:14},{wch:14},{wch:10},{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},
    ];

    XLSX.utils.book_append_sheet(wb, ws, s.month);

    // Filename: Year/Month_buildingName.xlsx — browser downloads as flat file
    // We encode the path in the filename so user can organize manually
    const filename = `${year}_${s.month}_${s.settings.buildingName}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const sendBackupEmail = async (snap) => {
    const s = snap || { rooms, settings, month: settings.month };
    try {
      // Generate Excel as base64
      const rows = s.rooms.filter(r => r.name || r.currWater || r.currElec).map(r => {
        const usedW = Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
        const usedE = Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
        const wFee = usedW*s.settings.waterRate, eFee = usedE*s.settings.elecRate;
        const pFee = parkingFee(r);
        return { "ห้อง":r.room, "ชื่อผู้เช่า":r.name||"-", "น้ำ(หน่วย)":usedW, "ค่าน้ำ":wFee, "ไฟ(หน่วย)":usedE, "ค่าไฟ":eFee, "ค่าจอด":pFee, "ค่าเฟอร์นิเจอร์":furnitureFee(r), "ค่าเช่า":roomRent(r), "รวม":roomRent(r)+wFee+eFee+pFee+furnitureFee(r), "จ่าย":r.paid?"✅":"⏳" };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), s.month);
      const b64 = XLSX.write(wb, { bookType:"xlsx", type:"base64" });
      const year = new Date().getFullYear();
      const filename = `${year}_${s.month}_${s.settings.buildingName}.xlsx`;

      await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: BACKUP_EMAIL,
        month: s.month,
        building: s.settings.buildingName,
        rooms_count: rows.length,
        total_revenue: rows.reduce((a,r)=>a+r["รวม"],0).toLocaleString("th-TH"),
        paid_count: rows.filter(r=>r["จ่าย"]==="✅").length,
        filename,
        attachment: b64,
      });
      alert(`✅ ส่ง Excel ไปที่ ${BACKUP_EMAIL} แล้ว`);
    } catch(e) {
      alert("❌ ส่งอีเมลไม่สำเร็จ: " + e.message + "\nตรวจสอบการตั้งค่า EmailJS ในไฟล์ App.jsx");
    }
  };

  // ── LINE push bill ─────────────────────────────────────────────────────────
  const sendLineBill = async (r) => {
    if (!r.lineUserId) return { ok: false, reason: "no_line_id" };
    if (!settings.lineChannelToken) return { ok: false, reason: "no_token" };
    const f = (n) => Number(n||0).toLocaleString("th-TH",{minimumFractionDigits:2});
    const usedW = Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
    const usedE = Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
    const wFee  = usedW*settings.waterRate;
    const eFee  = usedE*settings.elecRate;
    const total = roomTotal(r, settings);
    const lines = [
      `🏢 ${settings.buildingName}`,
      `📋 ใบแจ้งหนี้ประจำเดือน ${settings.month}`,
      `🏠 ห้อง ${r.room}  ผู้เช่า: ${r.name||"-"}`,
      `─────────────────────`,
      roomRent(r)>0     ? `ค่าเช่าห้อง        ฿${f(roomRent(r))}` : null,
      `ค่าน้ำ (${usedW} หน่วย)  ฿${f(wFee)}`,
      `ค่าไฟ (${usedE} หน่วย)  ฿${f(eFee)}`,
      parkingFee(r)>0   ? `ค่าจอดรถ           ฿${f(parkingFee(r))}` : null,
      furnitureFee(r)>0 ? `ค่าเฟอร์นิเจอร์    ฿${f(furnitureFee(r))}` : null,
      wifiFee(r)>0      ? `ค่า WiFi           ฿${f(wifiFee(r))}` : null,
      `─────────────────────`,
      `💰 ยอดรวม: ฿${f(total)}`,
      ``,
      `📅 กรุณาชำระก่อนวันที่ 5 ของเดือน`,
      settings.accountNumber ? `🏦 ${settings.bankName||""} เลขบัญชี ${settings.accountNumber}` : null,
      `ชื่อบัญชี: ${settings.ownerName||"ปวเรศ เมธากุลวรา"}`,
      ``,
      `⚠️ มีเพียงบัญชีนี้เท่านั้น โปรดระวังมิจฉาชีพ`,
    ].filter(Boolean).join("\n");

    try {
      const res = await fetch("/.netlify/functions/line-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: r.lineUserId, token: settings.lineChannelToken, text: lines }),
      });
      return res.ok ? { ok: true } : { ok: false, reason: await res.text() };
    } catch(e) {
      return { ok: false, reason: e.message };
    }
  };

  // ── Checkout (ย้ายออก) ───────────────────────────────────────────────────────
  const checkoutRoom = (roomNum) => {
    if (!window.confirm(`ย้ายออกห้อง ${roomNum}?

จะลบ: ชื่อผู้เช่า, LINE ID, รหัสห้อง
เก็บไว้: เลขมิเตอร์น้ำและไฟล่าสุด, ค่าเช่า, ค่าจอดรถ, ค่าเฟอร์นิเจอร์, WiFi`)) return;
    setRooms(rs => rs.map(r => {
      if (r.room !== roomNum) return r;
      const cleared = {
        ...r,
        name: "",
        lineUserId: "",
        paid: false,
        prevWater: r.currWater || r.prevWater,
        prevElec:  r.currElec  || r.prevElec,
        currWater: "",
        currElec:  "",
        updatedBy: adminName,
        updatedAt: new Date().toLocaleString("th-TH"),
      };
      saveRoom(cleared);
      return cleared;
    }));
  };

  const archiveMonth = () => {
    const snapshot = {
      month: settings.month,
      archivedAt: new Date().toISOString(),
      rooms: JSON.parse(JSON.stringify(rooms)),
      settings: JSON.parse(JSON.stringify(settings)),
    };
    setHistory(prev => {
      const updated = [snapshot, ...prev.filter(h => h.month !== settings.month)];
      return updated.slice(0, 6); // keep last 6 months
    });
    // reset current month meter readings but KEEP rent, parking, furniture persistent
    setRooms(rs => {
      const reset = rs.map(r => ({ ...r, prevWater: r.currWater, prevElec: r.currElec, currWater: "", currElec: "", paid: false }));
      saveAllRooms(reset);
      return reset;
    });
    // Note: rent, parking, furniture are kept as-is for next month
    alert(`✅ บันทึกข้อมูลเดือน ${settings.month} แล้ว\nค่ามิเตอร์ก่อนหน้าถูกอัพเดทพร้อมเริ่มเดือนใหม่`);
  };

  // ── sidebar nav config ───────────────────────────────────────────────────────
  const NAV = [
    { id:"dashboard", icon:"🏠", label:"แดชบอร์ด" },
    { id:"batch",     icon:"📷", label:"อ่านมิเตอร์" },
    { id:"entry",     icon:"📋", label:"ข้อมูลห้อง" },
    { id:"payment",   icon:"💰", label:"การชำระเงิน" },
    { id:"slip",      icon:"🧾", label:"ตรวจสลิป" },
    { id:"mail",      icon:"📬", label:"ไปรษณีย์" },
    { id:"repairs",   icon:"🔧", label:"แจ้งซ่อม" },
    { id:"history",   icon:"📅", label:"ประวัติ" },
    { id:"settings",  icon:"⚙️", label:"ตั้งค่า" },
  ];

  const pendingMail = mails.filter(m=>m.status!=="picked").length;
  const vacantRooms = 162 - rooms.filter(r=>r.name).length;

  // ── dashboard data ────────────────────────────────────────────────────────────
  const FLOOR_CONFIG = [
    {floor:2,total:18},{floor:3,total:18},{floor:4,total:18},{floor:5,total:18},
    {floor:6,total:18},{floor:7,total:18},{floor:8,total:18},{floor:9,total:14},
  ];
  const floorData = FLOOR_CONFIG.map(({floor,total})=>{
    const prefix = `2${floor}`;
    const floorRooms = rooms.filter(r=>r.room.startsWith(prefix));
    const occupied = floorRooms.filter(r=>r.name).length;
    const paid = floorRooms.filter(r=>r.paid).length;
    const rev = floorRooms.reduce((a,r)=>a+(r.name||r.currWater||r.currElec?roomTotal(r,settings):0),0);
    return { floor:`ชั้น ${floor}`, occupied, paid, total, rev };
  });

  return (
    <div style={NS.shell}>
      {/* ── SIDEBAR ── */}
      <aside style={NS.sidebar}>
        <div style={NS.sidebarTop}>
          <div style={NS.brandIcon}>🏢</div>
          <div style={NS.brandName}>{settings.buildingName||"Sirisuk Mansion"}</div>
          <div style={NS.brandSub}>{settings.month}</div>
        </div>

        <nav style={NS.navList}>
          {NAV.map(({id,icon,label})=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{...NS.navItem, ...(tab===id?NS.navItemActive:{})}}>
              <span style={NS.navIcon}>{icon}</span>
              <span style={NS.navLabel}>{label}</span>
              {id==="batch"&&unassigned>0&&<span style={NS.badge}>{unassigned}</span>}
              {id==="mail"&&pendingMail>0&&<span style={{...NS.badge,background:"#7c3aed"}}>{pendingMail}</span>}
            {id==="repairs"&&repairs.filter(r=>r.status==="open").length>0&&<span style={{...NS.badge,background:"#ef4444"}}>{repairs.filter(r=>r.status==="open").length}</span>}
            </button>
          ))}
        </nav>

        <div style={NS.sidebarBottom}>
          <button onClick={printAll} style={NS.btnSidebarPrint}>🖨️ พิมพ์ทั้งหมด</button>
          <div style={{fontSize:11,color:"#64748b",textAlign:"center",padding:"4px 0",marginBottom:4}}>
            👤 {adminName}
          </div>
          <button onClick={onLogout} style={NS.btnLogout}>ออกจากระบบ</button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={NS.main}>
        {/* top bar */}
        <div style={NS.topbar}>
          <div style={NS.pageTitle}>
            {NAV.find(n=>n.id===tab)?.icon} {NAV.find(n=>n.id===tab)?.label}
          </div>
          <div style={NS.topStats}>
            <TopStat label="ห้องทั้งหมด" value="140" />
            <TopStat label="มีผู้เช่า" value={rooms.filter(r=>r.name).length} color="#3b82f6" />
            <TopStat label="จ่ายแล้ว" value={paidCount} color="#22c55e" />
            <TopStat label="ยอดเดือนนี้" value={`฿${fmt(totalDue)}`} color="#f59e0b" />
          </div>
        </div>

        <div style={NS.content}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard" && (
          <div>
            {/* stat cards */}
            <div style={NS.statGrid}>
              {[
                {icon:"🏠", label:"ห้องทั้งหมด", value:"140", sub:`ว่าง ${vacantRooms} ห้อง`, color:"#3b82f6", bg:"#eff6ff"},
                {icon:"👥", label:"มีผู้เช่า", value:rooms.filter(r=>r.name).length, sub:`${Math.round(rooms.filter(r=>r.name).length/140*100)}% ของทั้งหมด`, color:"#8b5cf6", bg:"#f5f3ff"},
                {icon:"✅", label:"ชำระแล้ว", value:paidCount, sub:`คงเหลือ ${filled-paidCount} ห้อง`, color:"#22c55e", bg:"#f0fdf4"},
                {icon:"💰", label:"ยอดเดือนนี้", value:`฿${fmt(totalDue)}`, sub:settings.month, color:"#f59e0b", bg:"#fffbeb"},
                {icon:"📬", label:"ไปรษณีย์รอรับ", value:pendingMail, sub:"รายการ", color:"#7c3aed", bg:"#faf5ff"},
                {icon:"📊", label:"กรอกข้อมูลแล้ว", value:`${filled}/140`, sub:"ห้อง", color:"#0ea5e9", bg:"#f0f9ff"},
              ].map(c=>(
                <div key={c.label} style={{...NS.dashCard, background:c.bg, borderLeft:`4px solid ${c.color}`}}>
                  <div style={{fontSize:28,marginBottom:6}}>{c.icon}</div>
                  <div style={{fontSize:22,fontWeight:800,color:c.color}}>{c.value}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1e293b",marginTop:2}}>{c.label}</div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* floor overview */}
            <div style={{...NS.card, marginTop:0}}>
              <div style={NS.cardHeader}>
                <div style={NS.cardTitle}>📊 สรุปรายชั้น</div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"#f8fafc"}}>
                    {["ชั้น","ผู้เช่า","ชำระแล้ว","ว่าง","รายรับ (฿)","สถานะ"].map(h=>(
                      <th key={h} style={{padding:"10px 12px",textAlign:"left",color:"#475569",fontWeight:600,borderBottom:"2px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {floorData.map((f,i)=>{
                      const pct = Math.round(f.occupied/f.total*100);
                      return (
                        <tr key={f.floor} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"white":"#fafafa"}}>
                          <td style={{padding:"10px 12px",fontWeight:700,color:"#1e293b"}}>{f.floor}</td>
                          <td style={{padding:"10px 12px"}}>{f.occupied}/{f.total}</td>
                          <td style={{padding:"10px 12px"}}>
                            <span style={{background:"#dcfce7",color:"#15803d",padding:"2px 8px",borderRadius:99,fontSize:12,fontWeight:600}}>{f.paid}</span>
                          </td>
                          <td style={{padding:"10px 12px",color:"#94a3b8"}}>{f.total-f.occupied}</td>
                          <td style={{padding:"10px 12px",fontWeight:600}}>฿{fmt(f.rev)}</td>
                          <td style={{padding:"10px 12px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{flex:1,background:"#e2e8f0",borderRadius:99,height:6,minWidth:80}}>
                                <div style={{width:`${pct}%`,background:pct>80?"#22c55e":pct>50?"#3b82f6":"#f59e0b",height:6,borderRadius:99,transition:"width 0.3s"}}/>
                              </div>
                              <span style={{fontSize:11,color:"#64748b",minWidth:28}}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* room grid map */}
            <div style={{...NS.card}}>
              <div style={NS.cardHeader}>
                <div style={NS.cardTitle}>🗺️ แผนผังห้อง</div>
                <div style={{display:"flex",gap:12,fontSize:12,color:"#64748b"}}>
                  {[["#22c55e","ชำระแล้ว"],["#3b82f6","มีผู้เช่า"],["#f59e0b","ยังไม่ชำระ"],["#e2e8f0","ว่าง"]].map(([c,l])=>(
                    <span key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{width:10,height:10,borderRadius:3,background:c,display:"inline-block"}}/>
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              {FLOOR_CONFIG.map(({floor})=>{
                const floorRooms = rooms.filter(r=>r.room.startsWith(`2${floor}`));
                return (
                  <div key={floor} style={{marginBottom:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:4}}>ชั้น {floor}</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {floorRooms.map(r=>{
                        const bg = r.paid?"#22c55e":r.name&&(r.currWater||r.currElec)?"#f59e0b":r.name?"#3b82f6":"#e2e8f0";
                        const tc = r.name?"white":"#94a3b8";
                        return (
                          <div key={r.room} onClick={()=>setTab("entry")}
                            title={`ห้อง ${r.room}${r.name?` — ${r.name}`:""}`}
                            style={{width:36,height:28,background:bg,borderRadius:4,display:"flex",alignItems:"center",
                              justifyContent:"center",fontSize:9,fontWeight:700,color:tc,cursor:"pointer",
                              transition:"transform 0.1s",border:"1px solid rgba(0,0,0,0.06)"}}>
                            {r.room.slice(-2)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── BATCH METER UPLOAD ── */}
        {tab==="batch" && (
          <div>
            <div style={{...NS.card}}>
              <div style={NS.cardHeader}>
                <div style={NS.cardTitle}>เลือกประเภทมิเตอร์</div>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {[["elec","⚡","มิเตอร์ไฟฟ้า","#fef9c3","#854d0e","#facc15"],["water","💧","มิเตอร์น้ำ","#eff6ff","#1e40af","#3b82f6"]].map(([val,icon,label,bg,color,border])=>(
                  <button key={val} onClick={()=>setMeterType(val)}
                    style={{padding:"14px 24px",borderRadius:12,border:`2px solid ${meterType===val?border:"#e2e8f0"}`,
                      background:meterType===val?bg:"white",color:meterType===val?color:"#64748b",
                      fontWeight:meterType===val?700:400,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:24}}>{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{...NS.dropZone,...(dragOver?NS.dropActive:{})}}
              onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
              onDrop={handleDrop} onClick={()=>fileRef.current.click()}>
              <div style={{fontSize:40,marginBottom:10}}>{meterType==="elec"?"⚡":"💧"}</div>
              <div style={{fontWeight:700,fontSize:16,color:"#1e293b"}}>วางรูป{meterType==="elec"?"มิเตอร์ไฟฟ้า":"มิเตอร์น้ำ"}ทั้งหมดที่นี่</div>
              <div style={{color:"#94a3b8",fontSize:13,marginTop:6}}>หรือคลิกเพื่อเลือกไฟล์ · รองรับหลายรูปพร้อมกัน · AI อ่านเลขห้องและค่ามิเตอร์อัตโนมัติ</div>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>processFiles(e.target.files)} />
            </div>

            {photos.length>0 && (
              <div style={{...NS.card}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{display:"flex",gap:16}}>
                    <span style={{fontSize:13,color:"#475569"}}>อ่านแล้ว <strong>{done}/{photos.length}</strong> รูป</span>
                    <span style={{fontSize:13,color:"#22c55e"}}>✅ บันทึกอัตโนมัติ {photos.filter(p=>p.autoAssigned).length} รูป</span>
                    {unassigned>0&&<span style={{fontSize:13,color:"#f59e0b"}}>⚠️ รอตรวจสอบ {unassigned} รูป</span>}
                  </div>
                  <button onClick={clearAssigned} style={NS.btnSecondary}>ลบรูปที่บันทึกแล้ว</button>
                </div>
                <div style={{background:"#e2e8f0",borderRadius:99,height:8,marginBottom:16}}>
                  <div style={{background:"#22c55e",borderRadius:99,height:8,width:`${photos.length?(done/photos.length)*100:0}%`,transition:"width 0.4s"}}/>
                </div>
                <div style={NS.photoGrid}>
                  {photos.map(item=><MeterPhotoCard key={item.id} item={item} rooms={rooms} onAssign={assignPhoto} onManualReading={manualReading} onRemove={removePhoto}/>)}
                </div>
              </div>
            )}
            {photos.length===0&&<div style={NS.empty}>ยังไม่มีรูปมิเตอร์ · เลือกประเภทแล้วอัพโหลดด้านบน</div>}
          </div>
        )}

        {/* ── ROOM ENTRY ── */}
        {tab==="entry" && (
          <div style={NS.card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>📋</span>
                <span style={{fontSize:16,fontWeight:700,color:"#0f172a"}}>ข้อมูลผู้เช่า</span>
                <span style={{background:"#0f172a",color:"#fbbf24",fontSize:13,fontWeight:700,padding:"3px 12px",borderRadius:99}}>
                  📅 {settings.month}
                </span>
              </div>
              <span style={{fontSize:12,color:"#94a3b8"}}>{filteredRooms.length} ห้อง</span>
            </div>
            <div style={{display:"flex",gap:12,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหาห้องหรือชื่อผู้เช่า"
                style={{...NS.input,maxWidth:280}}/>
              <span style={{fontSize:13,color:"#94a3b8"}}>แสดง {filteredRooms.length} ห้อง</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:1200}}>
                <thead><tr style={{background:"#0f172a",color:"white"}}>
                  {["ห้อง","ชื่อผู้เช่า","น้ำ: ก่อน","น้ำ: หลัง","ไฟ: ก่อน","ไฟ: หลัง","ค่าเช่า","จอดรถ","เฟอร์นิเจอร์","WiFi","LINE ID","ค่าน้ำ","ค่าไฟ","รวม","จ่าย","พิมพ์/ส่ง","ย้ายออก","แก้ไขล่าสุด"].map(h=>(
                    <th key={h} style={{padding:"9px 7px",textAlign:"left",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredRooms.map((r,i)=>{
                    const usedW=Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
                    const usedE=Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
                    const pFee=parkingFee(r), fFee=furnitureFee(r), wFee=wifiFee(r), rRent=roomRent(r);
                    const waterFee=usedW*settings.waterRate, elecFee=usedE*settings.elecRate;
                    const total=rRent+waterFee+elecFee+pFee+fFee+wFee;
                    const hasLine = !!r.lineUserId;
                    return (
                      <tr key={r.id} style={{background:i%2===0?"white":"#f8fafc",borderBottom:"1px solid #f1f5f9"}}>
                        <td style={NS.td}><span style={NS.roomPill}>{r.room}</span></td>
                        <td style={NS.td}><input value={r.name} onChange={e=>updateRoom(r.room,"name",e.target.value)} placeholder="ชื่อ" style={{...NS.inputSm,width:88}}/></td>
                        {["prevWater","currWater","prevElec","currElec"].map(k=>(
                          <td key={k} style={NS.td}><input value={r[k]} type="number" onChange={e=>updateRoom(r.room,k,e.target.value)} placeholder="-" style={{...NS.inputSm,width:58}}/></td>
                        ))}
                        <td style={NS.td}><input value={r.rent} type="number" onChange={e=>updateRoom(r.room,"rent",e.target.value)} placeholder="฿" style={{...NS.inputSm,width:62,background:r.rent?"#f0fdf4":"white"}}/></td>
                        <td style={NS.td}><input value={r.parking} type="number" onChange={e=>updateRoom(r.room,"parking",e.target.value)} placeholder="฿" style={{...NS.inputSm,width:58,background:r.parking?"#faf5ff":"white"}}/></td>
                        <td style={NS.td}><input value={r.furniture} type="number" onChange={e=>updateRoom(r.room,"furniture",e.target.value)} placeholder="฿" style={{...NS.inputSm,width:58,background:r.furniture?"#eff6ff":"white"}}/></td>
                        <td style={NS.td}><input value={r.wifi} type="number" onChange={e=>updateRoom(r.room,"wifi",e.target.value)} placeholder="฿" title="ค่าบริการ WiFi" style={{...NS.inputSm,width:58,background:r.wifi?"#fefce8":"white"}}/></td>
                        <td style={NS.td}>
                          <input value={r.lineUserId} onChange={e=>updateRoom(r.room,"lineUserId",e.target.value)}
                            placeholder="U1234..." title="LINE User ID — ผู้เช่าลงทะเบียนผ่าน LINE OA"
                            style={{...NS.inputSm,width:90,fontSize:10,background:hasLine?"#f0fdf4":"white",color:hasLine?"#15803d":"#475569"}}/>
                          {hasLine && <span style={{fontSize:9,color:"#15803d",display:"block"}}>✅ เชื่อมแล้ว</span>}
                        </td>
                        <td style={{...NS.td,textAlign:"right",color:"#475569",fontSize:12}}>฿{fmt(waterFee)}</td>
                        <td style={{...NS.td,textAlign:"right",color:"#475569",fontSize:12}}>฿{fmt(elecFee)}</td>
                        <td style={{...NS.td,textAlign:"right",fontWeight:700,color:"#1e293b"}}>฿{fmt(total)}</td>
                        <td style={NS.td}>
                          <button onClick={async()=>{
                            togglePaid(r.room);
                            if(!r.paid && r.lineUserId) {
                              const result = await sendLineBill({...r, paid:false});
                              if(result.ok) alert(`✅ ส่ง LINE ห้อง ${r.room} แล้ว`);
                              else if(result.reason !== "no_line_id" && result.reason !== "no_token") alert(`⚠️ LINE: ${result.reason}`);
                            }
                          }} style={{padding:"4px 7px",border:"none",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,
                            background:r.paid?"#dcfce7":"#f1f5f9",color:r.paid?"#15803d":"#475569"}}>
                            {r.paid?"✅":"⏳"}
                          </button>
                        </td>
                        <td style={NS.td}>
                          <div style={{display:"flex",gap:3}}>
                            <button onClick={()=>printRoom(r)} style={{padding:"3px 7px",background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0",borderRadius:5,cursor:"pointer",fontSize:11}} title="พิมพ์">🖨️</button>
                            <button onClick={async()=>{
                              const result = await sendLineBill(r);
                              if(result.ok) alert(`✅ ส่ง LINE ห้อง ${r.room} แล้ว`);
                              else if(result.reason==="no_line_id") alert("ยังไม่มี LINE ID สำหรับห้องนี้");
                              else if(result.reason==="no_token") alert("ยังไม่ได้ตั้งค่า LINE Token ใน ⚙️ ตั้งค่า");
                              else alert(`❌ ส่งไม่สำเร็จ: ${result.reason}`);
                            }} style={{padding:"3px 7px",background:hasLine?"#dcfce7":"#f1f5f9",color:hasLine?"#15803d":"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,cursor:"pointer",fontSize:11}} title={hasLine?"ส่ง LINE":"ยังไม่มี LINE ID"}>
                              💬
                            </button>
                          </div>
                        </td>
                        <td style={NS.td}>
                          {r.name && (
                            <button onClick={()=>checkoutRoom(r.room)}
                              style={{padding:"3px 8px",background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                              ย้ายออก
                            </button>
                          )}
                        </td>
                        <td style={{...NS.td,minWidth:100}}>
                          {r.updatedBy && (
                            <div style={{fontSize:10,color:"#64748b",lineHeight:1.4}}>
                              <div style={{fontWeight:600,color:"#475569"}}>👤 {r.updatedBy}</div>
                              <div>{r.updatedAt}</div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PAYMENT ── */}
        {tab==="payment" && <PaymentTracker rooms={rooms} settings={settings} onTogglePaid={togglePaid}/>}

        {/* ── SLIP VERIFIER ── */}
        {tab==="slip" && <SlipVerifier rooms={rooms} settings={settings}/>}

        {/* ── MAIL ── */}
        {tab==="mail" && <MailTracker rooms={rooms} mails={mails} setMails={setMails} remindDays={remindDays} setRemindDays={setRemindDays} buildingName={settings.buildingName}/>}

        {/* ── REPAIRS ── */}
        {tab==="repairs" && <RepairTracker repairs={repairs} setRepairs={setRepairs} rooms={rooms} adminName={adminName} />}

        {/* ── HISTORY ── */}
        {tab==="history" && (
          <div>
            <div style={{...NS.card}}>
              <div style={NS.cardHeader}>
                <div>
                  <div style={NS.cardTitle}>📦 บันทึกเดือนปัจจุบัน</div>
                  <div style={{fontSize:13,color:"#64748b",marginTop:2}}>บันทึกข้อมูลเดือน {settings.month} และเริ่มเดือนใหม่ — มิเตอร์ก่อนหน้าอัพเดทอัตโนมัติ</div>
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <button onClick={()=>exportToExcel(null)} style={{...NS.btnGreen}}>📊 ดาวน์โหลด Excel</button>
                  <button onClick={()=>sendBackupEmail(null)} style={{...NS.btnBlue}}>📧 ส่ง Email สำรอง</button>
                  <button onClick={archiveMonth} style={{...NS.btnDark}}>📦 บันทึกและเริ่มเดือนใหม่</button>
                </div>
              </div>
            </div>

            {history.length===0
              ? <div style={NS.empty}>ยังไม่มีประวัติ · กด "บันทึกและเริ่มเดือนใหม่" เพื่อเก็บข้อมูลเดือนนี้</div>
              : history.map((snap,si)=>{
                  const totalRev=snap.rooms.reduce((acc,r)=>{
                    if(!r.name&&!r.currWater&&!r.currElec) return acc;
                    const usedW=Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
                    const usedE=Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
                    return acc+roomRent(r)+usedW*snap.settings.waterRate+usedE*snap.settings.elecRate+parkingFee(r)+furnitureFee(r)+wifiFee(r);
                  },0);
                  const paidR=snap.rooms.filter(r=>r.paid).length;
                  const filledR=snap.rooms.filter(r=>r.name||r.currWater||r.currElec).length;
                  return (
                    <details key={si} open={si===0} style={{...NS.card,marginBottom:12,padding:0,overflow:"hidden"}}>
                      <summary style={{padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,listStyle:"none",userSelect:"none",background:"#f8fafc"}}>
                        <span style={{fontSize:16}}>📅</span>
                        <span style={{fontWeight:700,fontSize:15,color:"#1e293b",flex:1}}>{snap.month}</span>
                        <span style={{fontSize:13,color:"#64748b"}}>{filledR} ห้อง</span>
                        <span style={{fontSize:13,color:"#22c55e",fontWeight:600}}>✅ {paidR} จ่ายแล้ว</span>
                        <span style={{fontSize:15,fontWeight:800,color:"#1e293b"}}>฿{fmt(totalRev)}</span>
                        <button onClick={e=>{e.preventDefault();exportToExcel(snap);}} style={{...NS.btnGreen,padding:"4px 12px",fontSize:12}}>📊 Excel</button>
                        <button onClick={e=>{e.preventDefault();sendBackupEmail(snap);}} style={{...NS.btnBlue,padding:"4px 12px",fontSize:12}}>📧 Email</button>
                      </summary>
                      <div style={{borderTop:"1px solid #e2e8f0",overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
                          <thead><tr style={{background:"#f1f5f9"}}>
                            {["ห้อง","ชื่อผู้เช่า","น้ำ ก่อน→หลัง","ไฟ ก่อน→หลัง","ค่าเช่า","ค่าน้ำ","ค่าไฟ","จอดรถ","เฟอร์นิเจอร์","รวม","จ่าย"].map(h=>(
                              <th key={h} style={{padding:"8px 12px",textAlign:"left",color:"#475569",fontWeight:600}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {snap.rooms.filter(r=>r.name||r.currWater||r.currElec).map((r,i)=>{
                              const usedW=Math.max(0,(parseFloat(r.currWater)||0)-(parseFloat(r.prevWater)||0));
                              const usedE=Math.max(0,(parseFloat(r.currElec)||0)-(parseFloat(r.prevElec)||0));
                              const pFee=parkingFee(r);
                              const fFee=furnitureFee(r);
                              const wFee=usedW*snap.settings.waterRate,eFee=usedE*snap.settings.elecRate;
                              const total=roomRent(r)+wFee+eFee+pFee+fFee;
                              return (
                                <tr key={r.room} style={{background:i%2===0?"white":"#fafafa",borderBottom:"1px solid #f1f5f9"}}>
                                  <td style={{padding:"8px 12px",fontWeight:600}}>{r.room}</td>
                                  <td style={{padding:"8px 12px",color:"#475569"}}>{r.name||"-"}</td>
                                  <td style={{padding:"8px 12px",color:"#475569"}}>{r.prevWater||0}→{r.currWater||0}</td>
                                  <td style={{padding:"8px 12px",color:"#475569"}}>{r.prevElec||0}→{r.currElec||0}</td>
                                  <td style={{padding:"8px 12px",textAlign:"right"}}>{roomRent(r)>0?`฿${fmt(roomRent(r))}`:"-"}</td>
                                  <td style={{padding:"8px 12px",textAlign:"right"}}>฿{fmt(wFee)}</td>
                                  <td style={{padding:"8px 12px",textAlign:"right"}}>฿{fmt(eFee)}</td>
                                  <td style={{padding:"8px 12px",textAlign:"right",color:"#7c3aed"}}>{pFee>0?`฿${fmt(pFee)}`:"-"}</td>
                                  <td style={{padding:"8px 12px",textAlign:"right",color:"#0ea5e9"}}>{furnitureFee(r)>0?`฿${fmt(furnitureFee(r))}`:"-"}</td>
                                  <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700}}>฿{fmt(total)}</td>
                                  <td style={{padding:"8px 12px",textAlign:"center"}}>{r.paid?"✅":"⏳"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  );
                })
            }
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==="settings" && (
          <div style={NS.card}>
            <div style={NS.cardTitle}>ตั้งค่าระบบ</div>
            <p style={{fontSize:13,color:"#64748b",marginBottom:20}}>ข้อมูลอาคารและอัตราค่าใช้จ่าย</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16}}>
              {[
                ["ชื่ออาคาร","buildingName","text"],
                ["ชื่อเจ้าของ (สำหรับตรวจสลิป)","ownerName","text"],
                ["ชื่อธนาคาร","bankName","text"],
                ["เลขบัญชี","accountNumber","text"],
                ["ค่าน้ำ (฿/หน่วย)","waterRate","number"],
                ["ค่าไฟ (฿/หน่วย)","elecRate","number"],
                ["เดือนที่เรียกเก็บ","month","text"],
                ["LINE Channel Access Token","lineChannelToken","text"],
                ["รหัสลงทะเบียน LINE (Room Password)","lineRoomPassword","text"],
              ].map(([label,key,type])=>(
                <label key={key} style={{display:"flex",flexDirection:"column",gap:6}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#475569"}}>{label}</span>
                  <input type={type} value={settings[key]} onChange={e=>updateSetting(key,type==="number"?parseFloat(e.target.value)||0:e.target.value)} style={NS.input}/>
                </label>
              ))}
            </div>
          </div>
        )}

        </div>
      </main>
    </div>
  );
}


// ── RepairTracker ─────────────────────────────────────────────────────────────
let repairId = 0;
function RepairTracker({ repairs, setRepairs, rooms, adminName }) {
  const [form, setForm] = useState({ room:"", description:"", priority:"normal" });
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("open");

  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const addRepair = () => {
    if (!form.room || !form.description) return;
    const room = rooms.find(r=>r.room===form.room);
    setRepairs(prev=>[{
      id: ++repairId,
      room: form.room,
      tenantName: room?.name || "",
      description: form.description,
      priority: form.priority,
      status: "open",
      createdAt: new Date().toLocaleString("th-TH"),
      createdBy: adminName,
      resolvedAt: null,
      resolvedBy: null,
      notes: "",
    }, ...prev]);
    setForm({ room:"", description:"", priority:"normal" });
    setAdding(false);
  };

  const resolve = (id) => setRepairs(prev=>prev.map(r=>r.id===id?{...r,status:"resolved",resolvedAt:new Date().toLocaleString("th-TH"),resolvedBy:adminName}:r));
  const deleteR = (id) => setRepairs(prev=>prev.filter(r=>r.id!==id));

  const openCount    = repairs.filter(r=>r.status==="open").length;
  const urgentCount  = repairs.filter(r=>r.status==="open"&&r.priority==="urgent").length;
  const visible      = filter==="all" ? repairs : repairs.filter(r=>r.status===filter);

  const priorityStyle = {
    urgent: { bg:"#fef2f2", border:"#fecaca", badge:"#dc2626", label:"🔴 ด่วน" },
    high:   { bg:"#fff7ed", border:"#fed7aa", badge:"#ea580c", label:"🟠 สูง" },
    normal: { bg:"white",   border:"#e2e8f0", badge:"#64748b", label:"🟡 ปกติ" },
    low:    { bg:"#f0fdf4", border:"#bbf7d0", badge:"#15803d", label:"🟢 ต่ำ" },
  };

  return (
    <div>
      {/* summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:16}}>
        {[["🔧 รอซ่อม",openCount,"#dc2626"],["🚨 ด่วน",urgentCount,"#ea580c"],["✅ แก้แล้ว",repairs.filter(r=>r.status==="resolved").length,"#15803d"],["📋 ทั้งหมด",repairs.length,"#1e293b"]].map(([l,v,c])=>(
          <div key={l} style={{background:"white",borderRadius:10,padding:"12px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:12,color:"#64748b"}}>{l}</div>
            <div style={{fontSize:22,fontWeight:700,color:c,marginTop:4}}>{v}</div>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {[["open","รอซ่อม"],["resolved","แก้แล้ว"],["all","ทั้งหมด"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{padding:"7px 14px",border:"1px solid #e2e8f0",borderRadius:8,cursor:"pointer",fontSize:13,
              background:filter===v?"#0f172a":"white",color:filter===v?"white":"#64748b"}}>
            {l}
          </button>
        ))}
        <button onClick={()=>setAdding(a=>!a)}
          style={{marginLeft:"auto",padding:"7px 16px",background:"#dc2626",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
          + บันทึกแจ้งซ่อม
        </button>
      </div>

      {/* add form */}
      {adding && (
        <div style={{background:"white",borderRadius:12,padding:18,marginBottom:16,border:"2px solid #dc2626",boxShadow:"0 2px 8px rgba(220,38,38,0.1)"}}>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b",marginBottom:14}}>🔧 บันทึกแจ้งซ่อมใหม่</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
            <label style={{display:"flex",flexDirection:"column",gap:4}}>
              <span style={{fontSize:12,fontWeight:600,color:"#475569"}}>ห้อง *</span>
              <input list="repair-rooms" value={form.room} onChange={e=>setF("room",e.target.value)} placeholder="พิมพ์เลขห้อง..."
                style={{padding:"7px 9px",border:"1px solid #e2e8f0",borderRadius:7,fontSize:13}}/>
              <datalist id="repair-rooms">
                {rooms.map(r=><option key={r.room} value={r.room}>{r.name?`${r.room} · ${r.name}`:r.room}</option>)}
              </datalist>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:4}}>
              <span style={{fontSize:12,fontWeight:600,color:"#475569"}}>ระดับความเร่งด่วน</span>
              <select value={form.priority} onChange={e=>setF("priority",e.target.value)}
                style={{padding:"7px 9px",border:"1px solid #e2e8f0",borderRadius:7,fontSize:13}}>
                <option value="urgent">🔴 ด่วนมาก</option>
                <option value="high">🟠 สูง</option>
                <option value="normal">🟡 ปกติ</option>
                <option value="low">🟢 ต่ำ</option>
              </select>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"1/-1"}}>
              <span style={{fontSize:12,fontWeight:600,color:"#475569"}}>รายละเอียด *</span>
              <textarea value={form.description} onChange={e=>setF("description",e.target.value)} rows={2}
                placeholder="เช่น: น้ำรั่ว, ไฟดับ, แอร์เสีย..."
                style={{padding:"7px 9px",border:"1px solid #e2e8f0",borderRadius:7,fontSize:13,resize:"vertical"}}/>
            </label>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={addRepair} disabled={!form.room||!form.description}
              style={{padding:"8px 20px",background:form.room&&form.description?"#dc2626":"#e2e8f0",color:form.room&&form.description?"white":"#94a3b8",border:"none",borderRadius:8,cursor:form.room&&form.description?"pointer":"not-allowed",fontWeight:700,fontSize:14}}>
              บันทึก
            </button>
            <button onClick={()=>setAdding(false)}
              style={{padding:"8px 16px",background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,cursor:"pointer",fontSize:14}}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* repair list */}
      {visible.length===0
        ? <div style={{textAlign:"center",color:"#94a3b8",padding:"48px 0",fontSize:14}}>
            ไม่มีรายการ{filter==="open"?"ที่รอซ่อม":""}
          </div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {visible.map(item=>{
              const ps = priorityStyle[item.priority] || priorityStyle.normal;
              return (
                <div key={item.id} style={{background:ps.bg,border:`1px solid ${ps.border}`,borderRadius:12,padding:"14px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                        <span style={{background:"#0f172a",color:"white",padding:"2px 8px",borderRadius:5,fontSize:12,fontWeight:700}}>ห้อง {item.room}</span>
                        {item.tenantName&&<span style={{fontSize:13,color:"#475569"}}>{item.tenantName}</span>}
                        <span style={{background:ps.badge,color:"white",fontSize:11,padding:"2px 8px",borderRadius:99,fontWeight:600}}>{ps.label}</span>
                        {item.status==="resolved"&&<span style={{background:"#dcfce7",color:"#15803d",fontSize:11,padding:"2px 8px",borderRadius:99,fontWeight:600}}>✅ แก้แล้ว</span>}
                      </div>
                      <div style={{fontSize:14,color:"#1e293b",fontWeight:600,marginBottom:4}}>{item.description}</div>
                      <div style={{fontSize:11,color:"#94a3b8"}}>
                        บันทึกโดย {item.createdBy} · {item.createdAt}
                        {item.resolvedAt&&` · แก้ไขโดย ${item.resolvedBy} · ${item.resolvedAt}`}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {item.status==="open"&&(
                        <button onClick={()=>resolve(item.id)}
                          style={{padding:"5px 12px",background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600}}>
                          ✅ แก้ไขแล้ว
                        </button>
                      )}
                      <button onClick={()=>deleteR(item.id)}
                        style={{padding:"5px 10px",background:"#fafafa",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:6,cursor:"pointer",fontSize:11}}>
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

export default function App() {
  const [session, setSession]   = useState(null);
  const [checking, setChecking] = useState(true);
  const [adminName, setAdmin]   = useState(() => sessionStorage.getItem("apt_admin") || "Admin");

  // Restore Supabase session on load + listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = (name) => { setAdmin(name); };
  const logout = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem("apt_admin");
    setAdmin("Admin");
    setSession(null);
  };

  if (checking) {
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f172a",color:"white",fontFamily:"'Sarabun',sans-serif",fontSize:16}}>กำลังโหลด...</div>;
  }
  // Need both a Supabase session AND a chosen nickname this session
  const hasNickname = !!sessionStorage.getItem("apt_admin");
  if (!session || !hasNickname) return <LoginScreen onLogin={login} />;
  return <ApartmentApp onLogout={logout} adminName={adminName} />;
}

function TopStat({label,value,color}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
      <span style={{fontSize:18,fontWeight:800,color:color||"#1e293b",lineHeight:1}}>{value}</span>
      <span style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{label}</span>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────
const NS = {
  shell:{display:"flex",minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Sarabun','Tahoma',sans-serif"},
  sidebar:{width:220,minWidth:220,background:"#0f172a",display:"flex",flexDirection:"column",position:"sticky",top:0,height:"100vh",overflow:"hidden"},
  sidebarTop:{padding:"24px 16px 20px",borderBottom:"1px solid rgba(255,255,255,0.07)"},
  brandIcon:{fontSize:32,marginBottom:6},
  brandName:{fontSize:15,fontWeight:800,color:"white",lineHeight:1.2},
  brandSub:{fontSize:11,color:"#64748b",marginTop:4},
  navList:{flex:1,padding:"12px 8px",overflow:"auto"},
  navItem:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",border:"none",background:"transparent",cursor:"pointer",color:"#94a3b8",fontSize:14,borderRadius:8,marginBottom:2,textAlign:"left",position:"relative",transition:"all 0.15s"},
  navItemActive:{background:"rgba(59,130,246,0.15)",color:"white",fontWeight:700},
  navIcon:{fontSize:16,width:20,textAlign:"center"},
  navLabel:{flex:1},
  badge:{background:"#ef4444",color:"white",borderRadius:99,fontSize:10,padding:"1px 6px",fontWeight:700,minWidth:18,textAlign:"center"},
  sidebarBottom:{padding:"12px 8px",borderTop:"1px solid rgba(255,255,255,0.07)"},
  btnSidebarPrint:{width:"100%",padding:"9px",background:"#f59e0b",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,marginBottom:6},
  btnLogout:{width:"100%",padding:"9px",background:"transparent",color:"#64748b",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,cursor:"pointer",fontSize:13},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"auto"},
  topbar:{background:"white",borderBottom:"1px solid #e2e8f0",padding:"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,position:"sticky",top:0,zIndex:10},
  pageTitle:{fontSize:18,fontWeight:800,color:"#1e293b"},
  topStats:{display:"flex",gap:24},
  content:{padding:"20px 24px",maxWidth:1400,margin:"0 auto",width:"100%"},
  statGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14,marginBottom:20},
  dashCard:{borderRadius:12,padding:"18px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"},
  card:{background:"white",borderRadius:12,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",marginBottom:20},
  cardHeader:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:16},
  cardTitle:{fontSize:16,fontWeight:700,color:"#1e293b"},
  dropZone:{border:"2px dashed #cbd5e1",borderRadius:12,padding:"40px 24px",textAlign:"center",cursor:"pointer",background:"white",marginBottom:16,transition:"all 0.2s"},
  dropActive:{borderColor:"#3b82f6",background:"#eff6ff"},
  photoGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14},
  empty:{textAlign:"center",color:"#94a3b8",padding:"60px 0",fontSize:14},
  input:{padding:"9px 12px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:14,outline:"none",width:"100%",background:"white"},
  inputSm:{padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:13,outline:"none",width:"100%",background:"white"},
  td:{padding:"8px 10px",verticalAlign:"middle"},
  roomPill:{background:"#0f172a",color:"white",padding:"3px 8px",borderRadius:6,fontSize:12,fontWeight:700},
  btnSecondary:{padding:"6px 14px",background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0",borderRadius:8,cursor:"pointer",fontSize:13},
  btnGreen:{padding:"9px 18px",background:"#22c55e",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13},
  btnBlue:{padding:"9px 18px",background:"#3b82f6",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13},
  btnDark:{padding:"9px 18px",background:"#0f172a",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13},
  btnPrimary:{padding:"10px 20px",background:"#0f172a",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:14},
  btnClear:{padding:"5px 12px",background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0",borderRadius:6,cursor:"pointer",fontSize:12},
  filterBtn:{padding:"7px 14px",border:"1px solid #e2e8f0",borderRadius:8,cursor:"pointer",fontSize:13,background:"white",color:"#64748b"},
  filterActive:{background:"#0f172a",color:"white",border:"1px solid #0f172a"},
  statCard:{background:"white",borderRadius:10,padding:"12px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"},
  roomCard:{borderRadius:10,padding:"12px",display:"flex",flexDirection:"column",gap:4},
  roomPaid:{background:"#f0fdf4",border:"1px solid #bbf7d0"},
  roomUnpaid:{background:"white",border:"1px solid #e2e8f0"},
  toggleBtn:{marginTop:4,padding:"5px 10px",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600},
  togglePaid:{background:"#dcfce7",color:"#15803d"},
  toggleUnpaid:{background:"#f1f5f9",color:"#475569"},
  // keep old aliases for sub-components that still use S.*
  photoCard:{background:"white",borderRadius:10,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.08)",display:"flex",flexDirection:"column"},
  photoImg:{width:"100%",height:110,objectFit:"cover",display:"block"},
  badge2:{position:"absolute",top:6,left:6,color:"white",fontSize:11,padding:"2px 7px",borderRadius:99,fontWeight:700},
  removeBtn:{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.5)",color:"white",border:"none",borderRadius:99,width:20,height:20,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"},
  inputTiny:{padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:13,outline:"none",width:"100%",marginBottom:2},
  applyBtn:{padding:"6px",background:"#0f172a",color:"white",border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:600},
  applyDisabled:{background:"#e2e8f0",color:"#94a3b8",cursor:"not-allowed"},
  settingsGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:16},
  inputFull:{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:14,outline:"none",width:"100%"},
  fieldLabel:{fontSize:13,fontWeight:600,color:"#475569"},
  expectedBox:{display:"flex",flexDirection:"column",gap:2,background:"#f8fafc",padding:"10px 12px",borderRadius:8,marginTop:8},
  infoGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:12},
  infoCell:{background:"white",padding:"8px 12px",borderRadius:8},
  flagsBox:{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:8,padding:"10px 14px",marginBottom:8},
  slipDrop:{border:"2px dashed #cbd5e1",borderRadius:10,padding:"20px",textAlign:"center",cursor:"pointer",background:"#f8fafc",minHeight:80,display:"flex",alignItems:"center",justifyContent:"center"},
  progressBox:{background:"white",borderRadius:10,padding:"14px 16px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"},
};

// keep S alias for sub-components (SlipVerifier, PaymentTracker, MailTracker use S.*)
const S = NS;
