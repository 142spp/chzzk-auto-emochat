const minRepetitionsInput = document.getElementById('minRepetitions');
const maxRepetitionsInput = document.getElementById('maxRepetitions');
// delayInput 제거, min/max 추가
const minDelayInput = document.getElementById('minDelay');
const maxDelayInput = document.getElementById('maxDelay');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');
const shortcutDisplayManual = document.getElementById('shortcutDisplayManual');
const shortcutDisplayAuto = document.getElementById('shortcutDisplayAuto');


// 설정 불러오기
function loadSettings() {
    // 'delay' 대신 'minDelay', 'maxDelay' 추가
    chrome.storage.sync.get(['minRepetitions', 'maxRepetitions', 'minDelay', 'maxDelay'], (result) => {
        minRepetitionsInput.value = result.minRepetitions || 1;
        maxRepetitionsInput.value = result.maxRepetitions || 1;
        minDelayInput.value = result.minDelay || 2000; // 기본 최소 딜레이
        maxDelayInput.value = result.maxDelay || 3000; // 기본 최대 딜레이
    });

    // 단축키 정보 가져오기 (동일)
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
    // delay 제거, min/max 추가
    const minDelay = parseInt(minDelayInput.value, 10);
    const maxDelay = parseInt(maxDelayInput.value, 10);


    // 반복 횟수 유효성 검사 (동일)
    if (isNaN(minRepetitions) || isNaN(maxRepetitions) || minRepetitions < 1 || maxRepetitions < 1) {
        statusDiv.textContent = '오류: 반복 횟수는 1 이상이어야 합니다.';
        statusDiv.style.color = 'red';
        setTimeout(() => statusDiv.textContent = '', 3000);
        return;
    }
    if (minRepetitions > maxRepetitions) {
        statusDiv.textContent = '오류: 최대 반복 횟수는 최소 반복 횟수보다 크거나 같아야 합니다.';
        statusDiv.style.color = 'red';
        setTimeout(() => statusDiv.textContent = '', 3000);
        return;
    }

    // 딜레이 유효성 검사 수정
    if (isNaN(minDelay) || isNaN(maxDelay)) {
        statusDiv.textContent = '오류: 자동 입력 간격은 숫자여야 합니다.';
        statusDiv.style.color = 'red';
        setTimeout(() => statusDiv.textContent = '', 3000);
        return;
    }
     if (minDelay < 500 || maxDelay < 500) {
        statusDiv.textContent = '오류: 자동 입력 간격은 500ms 이상이어야 합니다.';
        statusDiv.style.color = 'red';
        setTimeout(() => statusDiv.textContent = '', 3000);
        return;
    }
    if (minDelay > maxDelay) {
        statusDiv.textContent = '오류: 최대 간격은 최소 간격보다 크거나 같아야 합니다.';
        statusDiv.style.color = 'red';
        setTimeout(() => statusDiv.textContent = '', 3000);
        return;
    }


    // 'minDelay', 'maxDelay' 저장
    chrome.storage.sync.set({ minRepetitions, maxRepetitions, minDelay, maxDelay }, () => {
        statusDiv.textContent = '설정이 저장되었습니다!';
        statusDiv.style.color = 'green';
        setTimeout(() => statusDiv.textContent = '', 3000);
        chrome.runtime.sendMessage({ action: "settingsUpdated" }).catch(e => console.log("Background 메시지 전송 실패:", e));
    });
}

// 이벤트 리스너 및 링크 열기 (동일)
document.addEventListener('DOMContentLoaded', loadSettings);
saveButton.addEventListener('click', saveSettings);
const shortcutLink = document.querySelector('a[href="chrome://extensions/shortcuts"]');
if (shortcutLink) {
    shortcutLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: e.target.href });
    });
}