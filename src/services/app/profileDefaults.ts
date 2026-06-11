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
