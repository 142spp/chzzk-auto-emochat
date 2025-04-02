# Chzzk Auto Emoticon

치지직 채팅창에서 이모티콘을 자동/수동으로 전송할 수 있는 크롬 확장 프로그램입니다.

## 기능
- 자동/수동 이모티콘 전송
- 랜덤 이모티콘 선택
- 반복 횟수 설정
- 도배 방지 기능
- 토스트 메시지 알림

## 사용 방법
1. 크롬 확장 프로그램으로 설치
2. 치지직 채팅창에서 이모티콘 팝업을 한 번 열어서 데이터 로드
3. 단축키 또는 팝업 메뉴를 통해 자동/수동 전송 사용

## 단축키
- 수동 전송: (설정된 단축키)
- 자동 전송 토글: (설정된 단축키)

// 파일들을 GitHub에 푸시
await mcp_github_push_files({
  owner: "142spp",
  repo: "chzzk-auto-emochat",
  branch: "main",
  message: "Initial commit: Add extension files",
  files: [
    {
      path: "README.md",
      content: files[0].content
    },
    {
      path: "src/content.js",
      content: await read_file({
        target_file: "content.js",
        should_read_entire_file: true,
        start_line_one_indexed: 1,
        end_line_one_indexed_inclusive: 500
      })
    },
    {
      path: "src/background.js",
      content: await read_file({
        target_file: "background.js",
        should_read_entire_file: true,
        start_line_one_indexed: 1,
        end_line_one_indexed_inclusive: 500
      })
    }
  ]
});