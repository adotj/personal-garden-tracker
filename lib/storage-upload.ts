// lib/storage-upload.ts
import { supabase } from './supabase';

export async function uploadPlantImage(file: File): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error } = await supabase.storage
      .from('plant-photos')
      .upload(fileName, file, {
        cacheControl: '31536000, immutable', // 1 year + immutable for aggressive long-term browser caching
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data } = supabase.storage
      .from('plant-photos')
      .getPublicUrl(fileName);

    return data.publicUrl;
  } catch (err) {
    console.error('Failed to upload image:', err);
    return null;
  }
}

