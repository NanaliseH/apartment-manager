// supabaseSync.js — thin bridge between the app's room/settings shape and Supabase.
// Keeps the existing app logic untouched: it still works with camelCase objects.
import { supabase } from "./supabaseClient";

// ── field mapping (app camelCase ↔ db snake_case) ────────────────────────────
const roomToDb = (r) => ({
  room: r.room,
  name: r.name ?? "",
  prev_water: r.prevWater ?? "",
  curr_water: r.currWater ?? "",
  prev_elec: r.prevElec ?? "",
  curr_elec: r.currElec ?? "",
  rent: r.rent ?? "",
  parking: r.parking ?? "",
  furniture: r.furniture ?? "",
  wifi: r.wifi ?? "",
  line_user_id: r.lineUserId ?? "",
  paid: !!r.paid,
  paid_amount: r.paidAmount ?? null,
  paid_date: r.paidDate ?? null,
  slip_status: r.slipStatus ?? null,
  updated_by: r.updatedBy ?? "",
  updated_at: r.updatedAt ?? "",
});

const roomFromDb = (d) => ({
  id: d.room,
  room: d.room,
  name: d.name ?? "",
  prevWater: d.prev_water ?? "",
  currWater: d.curr_water ?? "",
  prevElec: d.prev_elec ?? "",
  currElec: d.curr_elec ?? "",
  rent: d.rent ?? "",
  parking: d.parking ?? "",
  furniture: d.furniture ?? "",
  wifi: d.wifi ?? "",
  lineUserId: d.line_user_id ?? "",
  paid: !!d.paid,
  paidAmount: d.paid_amount ?? null,
  paidDate: d.paid_date ?? null,
  slipStatus: d.slip_status ?? null,
  updatedBy: d.updated_by ?? "",
  updatedAt: d.updated_at ?? "",
});

const settingsToDb = (s) => ({
  id: 1,
  building_name: s.buildingName ?? "",
  owner_name: s.ownerName ?? "",
  bank_name: s.bankName ?? "",
  account_number: s.accountNumber ?? "",
  water_rate: Number(s.waterRate) || 0,
  elec_rate: Number(s.elecRate) || 0,
  line_channel_token: s.lineChannelToken ?? "",
  line_room_password: s.lineRoomPassword ?? "",
  month: s.month ?? "",
});

const settingsFromDb = (d) => ({
  buildingName: d.building_name ?? "",
  ownerName: d.owner_name ?? "",
  bankName: d.bank_name ?? "",
  accountNumber: d.account_number ?? "",
  waterRate: d.water_rate ?? 18,
  elecRate: d.elec_rate ?? 8,
  lineChannelToken: d.line_channel_token ?? "",
  lineRoomPassword: d.line_room_password ?? "",
  month: d.month ?? "",
});

// ── fetch ────────────────────────────────────────────────────────────────────
export async function fetchRooms() {
  const { data, error } = await supabase.from("rooms").select("*").order("room");
  if (error) throw error;
  return (data || []).map(roomFromDb);
}

export async function fetchSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return settingsFromDb(data);
}

// ── save (upsert) ────────────────────────────────────────────────────────────
export async function saveRoom(r) {
  const { error } = await supabase.from("rooms").upsert(roomToDb(r), { onConflict: "room" });
  if (error) console.error("saveRoom error:", error.message);
}

export async function saveAllRooms(rooms) {
  const { error } = await supabase.from("rooms").upsert(rooms.map(roomToDb), { onConflict: "room" });
  if (error) console.error("saveAllRooms error:", error.message);
}

export async function saveSettings(s) {
  const { error } = await supabase.from("settings").upsert(settingsToDb(s), { onConflict: "id" });
  if (error) console.error("saveSettings error:", error.message);
}

// ── realtime subscriptions ───────────────────────────────────────────────────
// Calls onRoomChange(updatedRoomObject) whenever any device changes a row.
export function subscribeRooms(onRoomChange) {
  return supabase
    .channel("rooms-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" },
      (payload) => { if (payload.new) onRoomChange(roomFromDb(payload.new)); })
    .subscribe();
}

export function subscribeSettings(onSettingsChange) {
  return supabase
    .channel("settings-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "settings" },
      (payload) => { if (payload.new) onSettingsChange(settingsFromDb(payload.new)); })
    .subscribe();
}

export { roomFromDb, roomToDb };
