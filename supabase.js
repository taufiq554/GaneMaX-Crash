require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://hgovybpinxykbhvaodsz.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable__AusQYku5UmuHr0CYUZ55Q_KVvbp7uf';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase connected!');

module.exports = supabase;