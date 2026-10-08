import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabaseStorageClient = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

/**
 * Faz upload de um ficheiro/buffer para o Supabase Storage.
 */
export async function uploadFileToSupabaseStorage(
  bucketName: string,
  filePath: string,
  fileBuffer: Buffer | Uint8Array,
  contentType: string
): Promise<{ path: string | null; publicUrl: string | null; error: string | null }> {
  if (!supabaseStorageClient) {
    return { path: null, publicUrl: null, error: "Supabase storage client not configured" };
  }

  const { data, error } = await supabaseStorageClient.storage
    .from(bucketName)
    .upload(filePath, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    return { path: null, publicUrl: null, error: error.message };
  }

  const { data: publicUrlData } = supabaseStorageClient.storage
    .from(bucketName)
    .getPublicUrl(data.path);

  return {
    path: data.path,
    publicUrl: publicUrlData.publicUrl,
    error: null,
  };
}
