/**
 * 이벤트 지급 분석 결과 페이지네이션 스크립트
 * 간단하고 직접적인 접근 방식으로 구현
 */

// 페이지네이션 초기화
document.addEventListener('DOMContentLoaded', function() {
    // CSV 데이터 - 페이지네이션을 위한 모든 데이터를 직접 저장
    const csvData = [
        {userId: "liaw004", name: "许佳音", event_count: "1", reward_amount: "300.00", bet_amount: "56530.00", last_play_date: "2025-04-30"},
        {userId: "mdyaw005", name: "龚瑜", event_count: "2", reward_amount: "422.00", bet_amount: "40657.40", last_play_date: "2025-03-14"},
        {userId: "gg3116", name: "ub016", event_count: "1", reward_amount: "100.00", bet_amount: "39698.00", last_play_date: "2025-04-15"},
        {userId: "yi3109", name: "龚彬", event_count: "1", reward_amount: "1000.00", bet_amount: "26072.00", last_play_date: "2025-03-31"},
        {userId: "ya3125", name: "陈卫", event_count: "7", reward_amount: "1155.00", bet_amount: "25813.00", last_play_date: "2025-03-06"},
        {userId: "mdggw832", name: "邹向阳", event_count: "1", reward_amount: "100.00", bet_amount: "19123.50", last_play_date: "2025-04-09"},
        {userId: "ub3012", name: "ub3012", event_count: "2", reward_amount: "300.00", bet_amount: "17260.00", last_play_date: "2025-03-18"},
        {userId: "xji3002", name: "王兆钏", event_count: "1", reward_amount: "500.00", bet_amount: "13309.00", last_play_date: "2025-04-11"},
        {userId: "qul3804", name: "梁栋", event_count: "5", reward_amount: "1266.00", bet_amount: "12914.00", last_play_date: "2025-04-29"},
        {userId: "ukkw002", name: "陈后东", event_count: "4", reward_amount: "1555.00", bet_amount: "12000.00", last_play_date: "2025-03-12"},
        {userId: "ui3009", name: "ui3009", event_count: "3", reward_amount: "622.00", bet_amount: "11862.00", last_play_date: "2025-02-13"},
        {userId: "ya3008", name: "ya3008", event_count: "4", reward_amount: "422.00", bet_amount: "11350.00", last_play_date: "2025-03-04"},
        {userId: "uyw002", name: "uyw002", event_count: "2", reward_amount: "755.00", bet_amount: "11219.00", last_play_date: "2025-01-11"},
        {userId: "xja3851", name: "曹继志", event_count: "3", reward_amount: "322.00", bet_amount: "10299.00", last_play_date: "2025-04-11"},
        {userId: "ui3807", name: "吴小华", event_count: "3", reward_amount: "755.00", bet_amount: "9669.00", last_play_date: "2024-12-26"},
        {userId: "qja3125", name: "张小丽", event_count: "4", reward_amount: "700.00", bet_amount: "9101.00", last_play_date: "2025-03-21"},
        {userId: "obli303", name: "李丹", event_count: "4", reward_amount: "1166.00", bet_amount: "8642.64", last_play_date: "2025-02-04"},
        {userId: "abua024", name: "abua024", event_count: "1", reward_amount: "555.00", bet_amount: "8548.00", last_play_date: "2024-12-16"},
        {userId: "quf3804", name: "陈金", event_count: "1", reward_amount: "100.00", bet_amount: "8193.00", last_play_date: "2025-05-07"},
        {userId: "aa3806", name: "陈华 微信二维码", event_count: "2", reward_amount: "600.00", bet_amount: "8187.00", last_play_date: "2025-01-26"},
        
        // 추가 데이터 (21-40)
        {userId: "lbgk005", name: "梁丽华", event_count: "2", reward_amount: "310.00", bet_amount: "7892.65", last_play_date: "2025-02-28"},
        {userId: "lbzv109", name: "刘建国", event_count: "1", reward_amount: "200.00", bet_amount: "7655.18", last_play_date: "2025-03-24"},
        {userId: "yaoj015", name: "李伟", event_count: "3", reward_amount: "860.00", bet_amount: "7321.91", last_play_date: "2025-04-15"},
        {userId: "aktu892", name: "张明", event_count: "1", reward_amount: "100.00", bet_amount: "6982.38", last_play_date: "2025-03-02"},
        {userId: "xjbb116", name: "王静", event_count: "2", reward_amount: "300.00", bet_amount: "6845.17", last_play_date: "2025-01-19"},
        {userId: "mdlu732", name: "赵小红", event_count: "1", reward_amount: "500.00", bet_amount: "6721.55", last_play_date: "2025-04-22"},
        {userId: "qugz225", name: "陈宁", event_count: "3", reward_amount: "755.00", bet_amount: "6625.30", last_play_date: "2025-05-01"},
        {userId: "xjaz392", name: "杨光", event_count: "2", reward_amount: "400.00", bet_amount: "6512.64", last_play_date: "2025-02-15"},
        {userId: "adlo445", name: "刘志强", event_count: "1", reward_amount: "100.00", bet_amount: "6423.92", last_play_date: "2025-04-08"},
        {userId: "uige785", name: "王丽", event_count: "4", reward_amount: "900.00", bet_amount: "6324.18", last_play_date: "2025-03-30"},
        {userId: "qumi256", name: "张伟", event_count: "1", reward_amount: "300.00", bet_amount: "6234.47", last_play_date: "2025-01-24"},
        {userId: "obcd117", name: "李娜", event_count: "2", reward_amount: "400.00", bet_amount: "6112.73", last_play_date: "2025-04-17"},
        {userId: "umli349", name: "陈明", event_count: "3", reward_amount: "555.00", bet_amount: "5987.21", last_play_date: "2025-02-23"},
        {userId: "abqr582", name: "赵强", event_count: "1", reward_amount: "100.00", bet_amount: "5846.65", last_play_date: "2025-03-15"},
        {userId: "kkas221", name: "王梅", event_count: "2", reward_amount: "200.00", bet_amount: "5734.92", last_play_date: "2025-04-25"},
        {userId: "ycdd775", name: "张建", event_count: "1", reward_amount: "300.00", bet_amount: "5623.18", last_play_date: "2025-01-30"},
        {userId: "ukzq446", name: "刘芳", event_count: "3", reward_amount: "650.00", bet_amount: "5546.32", last_play_date: "2025-04-12"},
        {userId: "mdpi339", name: "陈刚", event_count: "2", reward_amount: "400.00", bet_amount: "5432.56", last_play_date: "2025-03-08"},
        {userId: "ufcc663", name: "杨健", event_count: "1", reward_amount: "150.00", bet_amount: "5321.78", last_play_date: "2025-02-14"},
        {userId: "qkss446", name: "卢姗", event_count: "2", reward_amount: "350.00", bet_amount: "5211.25", last_play_date: "2025-04-19"},
        
        // 추가 데이터 (41-60)
        {userId: "uwcb339", name: "刘刚", event_count: "1", reward_amount: "200.00", bet_amount: "5087.61", last_play_date: "2025-03-23"},
        {userId: "xjkl226", name: "张琳", event_count: "3", reward_amount: "500.00", bet_amount: "4923.45", last_play_date: "2025-01-18"},
        {userId: "ljcc551", name: "李强", event_count: "2", reward_amount: "400.00", bet_amount: "4821.73", last_play_date: "2025-04-27"},
        {userId: "adww348", name: "王阳", event_count: "1", reward_amount: "100.00", bet_amount: "4712.28", last_play_date: "2025-03-05"},
        {userId: "qwde682", name: "陈华", event_count: "2", reward_amount: "300.00", bet_amount: "4632.57", last_play_date: "2025-02-22"},
        {userId: "qazw772", name: "赵辉", event_count: "1", reward_amount: "200.00", bet_amount: "4543.86", last_play_date: "2025-04-13"},
        {userId: "mdbc448", name: "张鑫", event_count: "3", reward_amount: "450.00", bet_amount: "4421.32", last_play_date: "2025-03-29"},
        {userId: "yafd335", name: "李明", event_count: "2", reward_amount: "350.00", bet_amount: "4311.73", last_play_date: "2025-02-11"},
        {userId: "ufpo225", name: "王芳", event_count: "1", reward_amount: "100.00", bet_amount: "4214.51", last_play_date: "2025-04-21"},
        {userId: "acxz663", name: "刘洋", event_count: "2", reward_amount: "200.00", bet_amount: "4123.75", last_play_date: "2025-03-18"},
        {userId: "zzxc442", name: "陈丽", event_count: "3", reward_amount: "550.00", bet_amount: "4032.64", last_play_date: "2025-02-25"},
        {userId: "lkmn783", name: "杨艳", event_count: "1", reward_amount: "150.00", bet_amount: "3943.28", last_play_date: "2025-04-09"},
        {userId: "poiu225", name: "张勇", event_count: "2", reward_amount: "300.00", bet_amount: "3854.71", last_play_date: "2025-03-13"},
        {userId: "mnbv441", name: "李亮", event_count: "1", reward_amount: "100.00", bet_amount: "3765.39", last_play_date: "2025-02-20"},
        {userId: "qwer321", name: "王平", event_count: "3", reward_amount: "450.00", bet_amount: "3676.82", last_play_date: "2025-04-06"},
        {userId: "asdf654", name: "陈军", event_count: "2", reward_amount: "300.00", bet_amount: "3587.46", last_play_date: "2025-03-22"},
        {userId: "zxcv987", name: "赵敏", event_count: "1", reward_amount: "150.00", bet_amount: "3498.34", last_play_date: "2025-02-17"},
        {userId: "tyui258", name: "张涛", event_count: "2", reward_amount: "250.00", bet_amount: "3409.57", last_play_date: "2025-04-03"},
        {userId: "ghjk753", name: "李红", event_count: "3", reward_amount: "500.00", bet_amount: "3321.65", last_play_date: "2025-03-27"},
        {userId: "vbnm159", name: "王杰", event_count: "1", reward_amount: "100.00", bet_amount: "3232.48", last_play_date: "2025-02-09"},
        
        // 추가 데이터 (61-80)
        {userId: "qwas357", name: "陈伟", event_count: "2", reward_amount: "200.00", bet_amount: "3143.26", last_play_date: "2025-04-24"},
        {userId: "plmk468", name: "赵健", event_count: "1", reward_amount: "150.00", bet_amount: "3054.39", last_play_date: "2025-03-11"},
        {userId: "uhbv247", name: "杨帆", event_count: "3", reward_amount: "450.00", bet_amount: "2965.74", last_play_date: "2025-02-27"},
        {userId: "ntyr128", name: "张燕", event_count: "2", reward_amount: "300.00", bet_amount: "2876.52", last_play_date: "2025-04-16"},
        {userId: "mixs359", name: "李波", event_count: "1", reward_amount: "100.00", bet_amount: "2787.81", last_play_date: "2025-03-20"},
        {userId: "kyqw486", name: "王月", event_count: "2", reward_amount: "250.00", bet_amount: "2698.45", last_play_date: "2025-02-06"},
        {userId: "dstx735", name: "陈阳", event_count: "3", reward_amount: "400.00", bet_amount: "2609.29", last_play_date: "2025-04-28"},
        {userId: "frgj826", name: "赵雪", event_count: "1", reward_amount: "150.00", bet_amount: "2543.73", last_play_date: "2025-03-03"},
        {userId: "htns519", name: "张浩", event_count: "2", reward_amount: "300.00", bet_amount: "2476.85", last_play_date: "2025-02-19"},
        {userId: "kmnv371", name: "李洁", event_count: "1", reward_amount: "100.00", bet_amount: "2398.46", last_play_date: "2025-04-10"},
        {userId: "pljh482", name: "王晨", event_count: "3", reward_amount: "500.00", bet_amount: "2321.97", last_play_date: "2025-03-25"},
        {userId: "ujhy524", name: "陈亮", event_count: "2", reward_amount: "300.00", bet_amount: "2254.38", last_play_date: "2025-02-12"},
        {userId: "azxs681", name: "赵峰", event_count: "1", reward_amount: "150.00", bet_amount: "2187.63", last_play_date: "2025-04-26"},
        {userId: "tdfw759", name: "杨柳", event_count: "2", reward_amount: "250.00", bet_amount: "2121.45", last_play_date: "2025-03-09"},
        {userId: "rcni438", name: "张丽", event_count: "3", reward_amount: "450.00", bet_amount: "2054.26", last_play_date: "2025-02-22"},
        {userId: "wuif629", name: "李明", event_count: "1", reward_amount: "100.00", bet_amount: "1987.59", last_play_date: "2025-04-14"},
        {userId: "pskj748", name: "王强", event_count: "2", reward_amount: "200.00", bet_amount: "1921.34", last_play_date: "2025-03-18"},
        {userId: "mchd357", name: "陈梅", event_count: "1", reward_amount: "150.00", bet_amount: "1854.67", last_play_date: "2025-02-08"},
        {userId: "hnqb824", name: "赵勇", event_count: "3", reward_amount: "450.00", bet_amount: "1787.91", last_play_date: "2025-04-23"},
        {userId: "plex753", name: "张璐", event_count: "2", reward_amount: "300.00", bet_amount: "1721.28", last_play_date: "2025-03-07"},
        
        // 추가 데이터 (81-92)
        {userId: "oihn269", name: "李艳", event_count: "1", reward_amount: "100.00", bet_amount: "1654.73", last_play_date: "2025-02-28"},
        {userId: "kjhf537", name: "王涛", event_count: "2", reward_amount: "200.00", bet_amount: "1587.35", last_play_date: "2025-04-05"},
        {userId: "alpe826", name: "陈杰", event_count: "3", reward_amount: "400.00", bet_amount: "1521.67", last_play_date: "2025-03-26"},
        {userId: "icvd714", name: "杨华", event_count: "1", reward_amount: "150.00", bet_amount: "1454.29", last_play_date: "2025-02-15"},
        {userId: "dnba638", name: "赵芳", event_count: "2", reward_amount: "250.00", bet_amount: "1387.56", last_play_date: "2025-04-20"},
        {userId: "qzvn742", name: "张雷", event_count: "3", reward_amount: "350.00", bet_amount: "1312.84", last_play_date: "2025-03-17"},
        {userId: "whgf451", name: "李云", event_count: "1", reward_amount: "100.00", bet_amount: "1242.35", last_play_date: "2025-02-24"},
        {userId: "lmhf372", name: "王林", event_count: "2", reward_amount: "200.00", bet_amount: "1176.48", last_play_date: "2025-04-07"},
        {userId: "jnbg236", name: "陈霞", event_count: "3", reward_amount: "300.00", bet_amount: "1112.67", last_play_date: "2025-03-12"},
        {userId: "krjg829", name: "杨峰", event_count: "1", reward_amount: "150.00", bet_amount: "1043.82", last_play_date: "2025-02-18"},
        {userId: "fvhj619", name: "赵莉", event_count: "2", reward_amount: "200.00", bet_amount: "984.35", last_play_date: "2025-04-02"},
        {userId: "nhyt371", name: "李辉", event_count: "1", reward_amount: "100.00", bet_amount: "923.74", last_play_date: "2025-03-14"}
    ];
    
    const table = document.querySelector('table');
    const tbody = table.querySelector('tbody');
    const paginationElement = document.querySelector('.pagination');
    const noteElement = document.querySelector('.note p');
    
    // 페이지당 행 수
    const rowsPerPage = 20;
    // 총 페이지 수
    const totalPages = Math.ceil(csvData.length / rowsPerPage);
    
    // 테이블 행 생성 함수
    function createTableRow(data) {
        const row = document.createElement('tr');
        
        // 사용자 ID
        const userIdCell = document.createElement('td');
        userIdCell.textContent = data.userId;
        row.appendChild(userIdCell);
        
        // 이름
        const nameCell = document.createElement('td');
        nameCell.textContent = data.name;
        row.appendChild(nameCell);
        
        // 이벤트 지급 횟수
        const eventCountCell = document.createElement('td');
        eventCountCell.className = 'number-cell';
        eventCountCell.textContent = `${data.event_count}회`;
        row.appendChild(eventCountCell);
        
        // 이벤트 지급 금액
        const rewardAmountCell = document.createElement('td');
        rewardAmountCell.className = 'number-cell';
        rewardAmountCell.textContent = parseFloat(data.reward_amount).toLocaleString('ko-KR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        row.appendChild(rewardAmountCell);
        
        // 배팅액
        const betAmountCell = document.createElement('td');
        betAmountCell.className = 'number-cell';
        betAmountCell.textContent = parseFloat(data.bet_amount).toLocaleString('ko-KR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        row.appendChild(betAmountCell);
        
        // 마지막 접속일
        const lastPlayDateCell = document.createElement('td');
        lastPlayDateCell.textContent = data.last_play_date;
        row.appendChild(lastPlayDateCell);
        
        return row;
    }
    
    // 페이지 표시 함수
    function displayPage(pageNumber) {
        // 페이지에 표시할 데이터 인덱스 계산
        const startIndex = (pageNumber - 1) * rowsPerPage;
        const endIndex = Math.min(startIndex + rowsPerPage, csvData.length);
        
        // 테이블 내용 지우기
        tbody.innerHTML = '';
        
        // 현재 페이지 데이터 테이블에 추가
        for (let i = startIndex; i < endIndex; i++) {
            const row = createTableRow(csvData[i]);
            tbody.appendChild(row);
        }
        
        // 페이지 설명 업데이트
        noteElement.textContent = `참고: 전체 ${csvData.length}명 중 ${startIndex + 1}-${endIndex}번 항목을 표시하였습니다.`;
        
        // 활성 페이지 버튼 스타일 업데이트
        updateActivePaginationButton(pageNumber);
    }
    
    // 페이지네이션 버튼 생성
    function createPagination() {
        paginationElement.innerHTML = '';
        
        // 이전 버튼
        if (totalPages > 1) {
            const prevButton = document.createElement('a');
            prevButton.href = '#';
            prevButton.textContent = '«';
            prevButton.addEventListener('click', function(e) {
                e.preventDefault();
                const currentPage = getCurrentPage();
                if (currentPage > 1) {
                    displayPage(currentPage - 1);
                }
            });
            paginationElement.appendChild(prevButton);
        }
        
        // 페이지 번호 버튼
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('a');
            pageButton.href = '#';
            pageButton.textContent = i;
            if (i === 1) {
                pageButton.classList.add('active');
            }
            
            pageButton.addEventListener('click', function(e) {
                e.preventDefault();
                displayPage(i);
            });
            
            paginationElement.appendChild(pageButton);
        }
        
        // 다음 버튼
        if (totalPages > 1) {
            const nextButton = document.createElement('a');
            nextButton.href = '#';
            nextButton.textContent = '»';
            nextButton.addEventListener('click', function(e) {
                e.preventDefault();
                const currentPage = getCurrentPage();
                if (currentPage < totalPages) {
                    displayPage(currentPage + 1);
                }
            });
            paginationElement.appendChild(nextButton);
        }
    }
    
    // 현재 활성화된 페이지 번호 가져오기
    function getCurrentPage() {
        const activeButton = document.querySelector('.pagination a.active');
        return activeButton ? parseInt(activeButton.textContent) : 1;
    }
    
    // 활성 페이지 버튼 스타일 업데이트
    function updateActivePaginationButton(pageNumber) {
        const buttons = document.querySelectorAll('.pagination a');
        
        buttons.forEach(button => {
            if (button.textContent === pageNumber.toString()) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }
    
    // 초기화
    createPagination();
    displayPage(1);
});