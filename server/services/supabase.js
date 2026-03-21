// services/supabase.js
// Single Supabase client instance using the service-role key.
// ──────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Upload an image buffer to the "posts" storage bucket and return
 * the full public URL.
 *
 * @param {Buffer}  fileBuffer  Raw file bytes
 * @param {string}  filename    Desired object name inside the bucket
 * @param {string}  mimetype    MIME type, e.g. "image/png"
 * @returns {Promise<string>}   Full public URL of the uploaded file
 */
async function uploadImage(fileBuffer, filename, mimetype) {
  // Prefix with timestamp to avoid collisions
  const objectName = `${Date.now()}-${filename}`;

  const { error } = await supabase.storage
    .from('posts')
    .upload(objectName, fileBuffer, {
      contentType: mimetype,
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from('posts')
    .getPublicUrl(objectName);

  return data.publicUrl;
}

module.exports = { supabase, uploadImage };
