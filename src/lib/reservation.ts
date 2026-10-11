/**
 * Naver Reservation Link Handler
 * Centralized reservation handler for Labor Law Firm Nine.
 * Strict compliance: No internal calendar, no internal DB booking state.
 */

export function handleNaverReservation(naverReservationUrl?: string) {
  const targetUrl = naverReservationUrl?.trim();

  if (!targetUrl) {
    alert('네이버 예약 링크 설정이 필요합니다.');
    return;
  }

  // Open the official Naver reservation page in a new window/tab
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}
