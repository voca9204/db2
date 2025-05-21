// 보고서 네비게이션 스크립트
document.addEventListener('DOMContentLoaded', function() {
  // 현재 페이지 URL 가져오기
  const currentPath = window.location.pathname;
  
  // 네비게이션 링크 생성
  const navLinks = [
    { text: '메인 대시보드', url: '/index.html' },
    { text: '고가치 사용자 분석', url: '/reports/user_analysis/high_value_users_report.html' },
    { text: '휴면 사용자 분석', url: '/reports/user_analysis/inactive_event_deposit_analysis.html' }
  ];
  
  // 네비게이션 요소 생성
  const nav = document.createElement('nav');
  nav.className = 'report-nav';
  
  const ul = document.createElement('ul');
  nav.appendChild(ul);
  
  // 네비게이션 링크 추가
  navLinks.forEach(link => {
    const li = document.createElement('li');
    li.className = currentPath === link.url ? 'active' : '';
    
    const a = document.createElement('a');
    a.href = link.url;
    a.textContent = link.text;
    
    li.appendChild(a);
    ul.appendChild(li);
  });
  
  // 네비게이션 요소를 헤더 다음에 삽입
  const header = document.querySelector('header');
  if (header && header.nextSibling) {
    header.parentNode.insertBefore(nav, header.nextSibling);
  }
});
