// Aktif grup seçimi — tarayıcıda saklanır, sayfalar buradan okur
export function getActiveGroupId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeGroupId');
}

export function setActiveGroupId(id) {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem('activeGroupId', id);
  else localStorage.removeItem('activeGroupId');
  window.dispatchEvent(new Event('groupchange'));
}
