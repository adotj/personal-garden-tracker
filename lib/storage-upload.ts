// lib/storage-upload.ts
import { supabase } from './supabase';

export async function uploadPlantImage(file: File): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error } = await supabase.storage
      .from('plant-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
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

// Returns Error if failed, null if successful
export async function deletePlantImageFromStorage(photoUrl: string | null): Promise<Error | null> {
  if (!photoUrl) return null;

  try {
    const url = new URL(photoUrl);
    const pathParts = url.pathname.split('/');
    // Remove /storage/v1/object/public/plant-photos/
    const filePath = decodeURIComponent(pathParts.slice(3).join('/'));

    const { error } = await supabase.storage
      .from('plant-photos')
      .remove([filePath]);

    if (error) {
      console.error('Storage delete error:', error);
      return error;
    }

    return null;
  } catch (err: any) {
    console.error('Failed to delete image from storage:', err);
    return err;
  }
}
