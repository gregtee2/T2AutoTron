export function initAuth() {
  const isElectron = navigator.userAgent.toLowerCase().includes('electron');
  if (isElectron) {
    window.logout = () => console.log('Logout not needed in Electron');
    return;
  }

  const authenticated = sessionStorage.getItem('authenticated');
  const authTime = sessionStorage.getItem('authTime');
  const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;

  if (!authenticated || !authTime || Date.now() - parseInt(authTime) > SESSION_TIMEOUT) {
    sessionStorage.clear();
    window.location.href = '/login.html';
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = '/login.html';
  });
}