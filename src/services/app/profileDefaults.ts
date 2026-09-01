import AppSetting from '../../models/AppSetting';

export function applyProfileDefaults(profile: any) {
  const obj = profile?.toObject ? profile.toObject() : { ...profile };

  return {
    ...obj,
    name: obj.name || 'User',
    bio: obj.bio || '',
    email: obj.email || '',
    mobile: obj.mobile || '',
    gender: obj.gender || 'Other',
    height: obj.height || '',
    weight: obj.weight || '',
    country: obj.country || '',
    nationality: obj.nationality || '',
    selfIntroduce: obj.selfIntroduce || '',
    maritalStatus: obj.maritalStatus || '',
    emotionalStatus: obj.emotionalStatus || 'single',
    profileImage: obj.profileImage || null,
    album: obj.album || [],
    hobbies: obj.hobbies || [],
    location: obj.location || {
      lat: null,
      lng: null,
      address: '',
      city: '',
      state: '',
      zipcode: '',
    },
  };
}

function normalizeAlbumItem(item: any) {
  const obj = item?.toObject ? item.toObject() : { ...item };
  return { ...obj, isDefault: false };
}

function hasRealAlbumPhotos(album: any[]): boolean {
  if (!Array.isArray(album) || album.length === 0) return false;
  return album.some((item) => item && !item.isDefault && (item.url || item._id));
}

export function buildDefaultAlbumItem(url: string) {
  return {
    _id: null,
    url,
    type: 'image',
    isDefault: true,
  };
}

export async function getDefaultAlbumImageUrl(): Promise<string> {
  const setting = await AppSetting.findOne({ key: 'default_album_image_url' });
  const value = setting?.value;
  return typeof value === 'string' ? value.trim() : '';
}

export async function withDefaultAlbum(album?: any[]): Promise<any[]> {
  const photos = Array.isArray(album) ? album.filter((item) => item && !item.isDefault) : [];
  if (hasRealAlbumPhotos(photos)) {
    return photos.map(normalizeAlbumItem);
  }

  const defaultUrl = await getDefaultAlbumImageUrl();
  if (!defaultUrl) return [];
  return [buildDefaultAlbumItem(defaultUrl)];
}

export async function applyProfileDefaultsWithAlbum(profile: any) {
  const data = applyProfileDefaults(profile);
  data.album = await withDefaultAlbum(data.album);
  return data;
}
