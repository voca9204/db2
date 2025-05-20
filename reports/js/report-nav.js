/**
 * 보고서 네비게이션 초기화 함수
 * 모든 보고서에 통일된 네비게이션 버튼을 추가합니다.
 */
function initReportNavigation() {
    // 네비게이션 요소 생성
    const navDiv = document.createElement('div');
    navDiv.className = 'report-nav';
    
    // 홈 버튼 생성 (index.html로 이동)
    const homeButton = document.createElement('a');
    homeButton.href = '/index.html';
    homeButton.className = 'nav-button home';
    homeButton.innerHTML = '<i class="icon">🏠</i> 메인 페이지';
    navDiv.appendChild(homeButton);
    
    // 돌아가기 버튼 생성 (이전 페이지로 이동)
    const backButton = document.createElement('a');
    backButton.href = 'javascript:history.back()';
    backButton.className = 'nav-button';
    backButton.innerHTML = '<i class="icon">⬅️</i> 이전 페이지';
    navDiv.appendChild(backButton);
    
    // body에 네비게이션 추가
    document.body.appendChild(navDiv);
    
    // 창 스크롤 이벤트에 따른 네비게이션 표시/숨김 처리
    let lastScrollTop = 0;
    window.addEventListener('scroll', function() {
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // 스크롤 방향에 따라 버튼 표시/숨김
        if (currentScrollTop > lastScrollTop && currentScrollTop > 200) {
            // 아래로 스크롤 - 버튼 숨김
            navDiv.style.transform = 'translateY(-100px)';
            navDiv.style.opacity = '0';
        } else {
            // 위로 스크롤 또는 페이지 상단 - 버튼 표시
            navDiv.style.transform = 'translateY(0)';
            navDiv.style.opacity = '1';
        }
        
        lastScrollTop = currentScrollTop;
    });
    
    // 스타일 변경 처리
    navDiv.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
}

// 페이지 로드 시 네비게이션 초기화
document.addEventListener('DOMContentLoaded', initReportNavigation);
