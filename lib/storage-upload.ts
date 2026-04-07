import { supabase } from './supabase';

export async function uploadPlantImage(file: File): Promise<string | null> {
  try {
    const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('plant-photos').upload(fileName, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('plant-photos').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
}

export async function deletePlantImageFromStorage(photoUrl: string | null) {
  if (!photoUrl) return;
  try {
    const fileName = photoUrl.split('/').pop() || '';
    await supabase.storage.from('plant-photos').remove([fileName]);
  } catch {
    /* ignore */
  }
}
