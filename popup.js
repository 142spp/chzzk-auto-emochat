const minRepetitionsInput = document.getElementById('minRepetitions');
const maxRepetitionsInput = document.getElementById('maxRepetitions');
const minDelayInput = document.getElementById('minDelay');
const maxDelayInput = document.getElementById('maxDelay');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');
const shortcutDisplayManual = document.getElementById('shortcutDisplayManual');
const shortcutDisplayAuto = document.getElementById('shortcutDisplayAuto');

// 상태 메시지 표시 함수
function showStatus(message, type = 'success') {
    statusDiv.textContent = message;
    statusDiv.className = type;
    
    // 3초 후에 메시지를 숨김
    setTimeout(() => {
        statusDiv.className = '';
        statusDiv.textContent = '';
    }, 3000);
}

// 설정 불러오기
function loadSettings() {
    chrome.storage.sync.get(['minRepetitions', 'maxRepetitions', 'minDelay', 'maxDelay'], (result) => {
        minRepetitionsInput.value = result.minRepetitions || 1;
        maxRepetitionsInput.value = result.maxRepetitions || 1;
        minDelayInput.value = result.minDelay || 2000;
        maxDelayInput.value = result.maxDelay || 3000;
    });

    chrome.commands.getAll((commands) => {
        const manualCommand = commands.find(cmd => cmd.name === 'trigger-emoticon');
        const autoCommand = commands.find(cmd => cmd.name === 'toggle-auto-send');
        shortcutDisplayManual.textContent = manualCommand?.shortcut || 'Ctrl+Shift+E (기본값)';
        shortcutDisplayAuto.textContent = autoCommand?.shortcut || 'Ctrl+Shift+R (기본값)';
    });
}

// 설정 저장하기
function saveSettings() {
    const minRepetitions = parseInt(minRepetitionsInput.value, 10);
    const maxRepetitions = parseInt(maxRepetitionsInput.value, 10);
    const minDelay = parseInt(minDelayInput.value, 10);
    const maxDelay = parseInt(maxDelayInput.value, 10);

    // 반복 횟수 유효성 검사
    if (isNaN(minRepetitions) || isNaN(maxRepetitions) || minRepetitions < 1 || maxRepetitions < 1) {
        showStatus('반복 횟수는 1 이상이어야 합니다.', 'error');
        return;
    }
    if (minRepetitions > maxRepetitions) {
        showStatus('최대 반복 횟수는 최소 반복 횟수보다 크거나 같아야 합니다.', 'error');
        return;
    }

    // 딜레이 유효성 검사
    if (isNaN(minDelay) || isNaN(maxDelay)) {
        showStatus('자동 입력 간격은 숫자여야 합니다.', 'error');
        return;
    }
    if (minDelay < 500 || maxDelay < 500) {
        showStatus('자동 입력 간격은 500ms 이상이어야 합니다.', 'error');
        return;
    }
    if (minDelay > maxDelay) {
        showStatus('최대 간격은 최소 간격보다 크거나 같아야 합니다.', 'error');
        return;
    }

    // 설정 저장
    chrome.storage.sync.set({ minRepetitions, maxRepetitions, minDelay, maxDelay }, () => {
        showStatus('설정이 저장되었습니다!', 'success');
        chrome.runtime.sendMessage({ action: "settingsUpdated" })
            .catch(e => console.log("Background 메시지 전송 실패:", e));
    });
}

// 이벤트 리스너
document.addEventListener('DOMContentLoaded', loadSettings);
saveButton.addEventListener('click', saveSettings);

// 단축키 링크 처리
const shortcutLink = document.querySelector('a[href="chrome://extensions/shortcuts"]');
if (shortcutLink) {
    shortcutLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: e.target.href });
    });
}