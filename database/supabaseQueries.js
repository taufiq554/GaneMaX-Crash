const supabase = require('./supabase');

// ==================== USERS ==================== //

async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getUserByUsername(username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function createUser(username, key, expired, role = 'user') {
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, key, expired, role }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateUser(username, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('username', username)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteUser(username) {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('username', username);
  if (error) throw error;
  return true;
}

async function getUserCount() {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

// ==================== AKSES ==================== //

async function getAkses() {
  const { data, error } = await supabase.from('akses').select('*');
  if (error) throw error;
  
  const result = { owners: [], akses: [], resellers: [], pts: [], moderators: [] };
  data.forEach(item => {
    if (item.role === 'owner') result.owners.push(item.user_id);
    else if (item.role === 'akses') result.akses.push(item.user_id);
    else if (item.role === 'reseller') result.resellers.push(item.user_id);
    else if (item.role === 'pt') result.pts.push(item.user_id);
    else if (item.role === 'moderator') result.moderators.push(item.user_id);
  });
  return result;
}

async function addAkses(userId, role) {
  const { data, error } = await supabase
    .from('akses')
    .insert([{ user_id: userId, role }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeAkses(userId, role) {
  const { error } = await supabase
    .from('akses')
    .delete()
    .eq('user_id', userId)
    .eq('role', role);
  if (error) throw error;
  return true;
}

async function isOwner(userId) {
  const { data, error } = await supabase
    .from('akses')
    .select('*')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function isAuthorized(userId) {
  const { data, error } = await supabase
    .from('akses')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data && data.length > 0;
}

async function isReseller(userId) {
  const { data, error } = await supabase
    .from('akses')
    .select('*')
    .eq('user_id', userId)
    .eq('role', 'reseller')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function isPT(userId) {
  const { data, error } = await supabase
    .from('akses')
    .select('*')
    .eq('user_id', userId)
    .eq('role', 'pt')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function isModerator(userId) {
  const { data, error } = await supabase
    .from('akses')
    .select('*')
    .eq('user_id', userId)
    .eq('role', 'moderator')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

// ==================== SESSIONS ==================== //

async function getActiveSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('bot_number')
    .eq('is_active', true);
  if (error) throw error;
  return data.map(s => s.bot_number);
}

async function saveSession(botNumber, sessionData) {
  const { data, error } = await supabase
    .from('sessions')
    .upsert({
      bot_number: botNumber,
      session_data: sessionData,
      is_active: true,
      updated_at: new Date()
    }, { onConflict: 'bot_number' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteSession(botNumber) {
  const { error } = await supabase
    .from('sessions')
    .update({ is_active: false })
    .eq('bot_number', botNumber);
  if (error) throw error;
  return true;
}

// ==================== HISTORY ==================== //

async function addHistory(username, activity, details = '') {
  const { data, error } = await supabase
    .from('history')
    .insert([{ username, activity, details, timestamp: Date.now() }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getHistory(username, limit = 20) {
  const { data, error } = await supabase
    .from('history')
    .select('*')
    .eq('username', username)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ==================== MESSAGES ==================== //

async function saveMessage(msgId, toUsername, fromId, senderName, content) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      msg_id: msgId,
      to_username: toUsername,
      from_id: fromId,
      sender_name: senderName,
      content,
      timestamp: Date.now(),
      read: false,
      replied: false
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getMessagesForUser(username) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('to_username', username)
    .eq('replied', false)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function markMessageReplied(msgId) {
  const { error } = await supabase
    .from('messages')
    .update({ replied: true })
    .eq('msg_id', msgId);
  if (error) throw error;
  return true;
}

module.exports = {
  getUsers,
  getUserByUsername,
  createUser,
  updateUser,
  deleteUser,
  getUserCount,
  getAkses,
  addAkses,
  removeAkses,
  isOwner,
  isAuthorized,
  isReseller,
  isPT,
  isModerator,
  getActiveSessions,
  saveSession,
  deleteSession,
  addHistory,
  getHistory,
  saveMessage,
  getMessagesForUser,
  markMessageReplied
};
