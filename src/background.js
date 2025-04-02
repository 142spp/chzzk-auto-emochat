let lastExecutionTime = 0;
let isAutoSending = false;
let isPausedBySpamGuard = false; // 도배 방지 일시정지 상태
let autoSendTimeoutId = null; // 이제 Timeout ID 사용

// 기본값 설정 업데이트
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['minRepetitions', 'maxRepetitions', 'minDelay', 'maxDelay'], (result) => {
    if (result.minRepetitions === undefined) chrome.storage.sync.set({ minRepetitions: 1 });
    if (result.maxRepetitions === undefined) chrome.storage.sync.set({ maxRepetitions: 1 });
    if (result.minDelay === undefined) chrome.storage.sync.set({ minDelay: 2000 });
    if (result.maxDelay === undefined) chrome.storage.sync.set({ maxDelay: 3000 });
  });
  console.log('이모티콘 도우미 설치/업데이트됨. 기본 설정 확인.');
  updateIconBadge();
});

chrome.runtime.onStartup.addListener(() => {
    isAutoSending = false;
    isPausedBySpamGuard = false;
    if (autoSendTimeoutId) {
        clearTimeout(autoSendTimeoutId);
        autoSendTimeoutId = null;
    }
    updateIconBadge();
});


function updateIconBadge() {
    let badgeText = '';
    let color = '#9E9E9E'; // 기본 회색 (꺼짐)
    if (isAutoSending) {
        if (isPausedBySpamGuard) {
            badgeText = 'PAUSE';
            color = '#FF9800'; // 주황색 (일시정지)
        } else {
            badgeText = 'ON';
            color = '#4CAF50'; // 초록색 (켜짐)
        }
    }
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: color });
}

// 토스트 메시지 전송 함수
function showToastInActiveTab(message) {
    chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.chzzk.naver.com/*" }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "showToast", message: message })
                .catch(e => console.log("토스트 메시지 전송 실패:", e));
        }
    });
}

function sendEmoticonTriggerToActiveTab(isAuto = true) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.chzzk.naver.com/*" }, (tabs) => {
            if (tabs.length > 0) {
                const tabId = tabs[0].id;
                console.log(`탭 (${tabId})에 이모티콘 트리거 전송 (${isAuto ? '자동' : '수동'})`);
                chrome.tabs.sendMessage(tabId, { 
                    action: "injectAndSendTrigger", 
                    isAuto: isAuto
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("메시지 전송 실패:", chrome.runtime.lastError.message);
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        console.log("콘텐츠 스크립트 작업 성공 응답");
                        resolve(true);
                    } else {
                        console.log("콘텐츠 스크립트 응답 실패 또는 작업 실패:", response);
                        reject(new Error("Content script failed"));
                    }
                });
            } else {
                console.log("활성 치지직 탭 없음.");
                reject(new Error("No active Chzzk tab found"));
            }
        });
    });
}

// 다음 자동 실행 예약 함수 (재귀적 setTimeout 사용)
function scheduleNextAutoSend() {
    if (!isAutoSending || isPausedBySpamGuard) { // 활성 상태이고, 일시정지 상태가 아닐 때만 실행
        console.log("다음 자동 실행 예약 중지됨 (비활성 또는 일시정지).");
        if (autoSendTimeoutId) {
            clearTimeout(autoSendTimeoutId);
            autoSendTimeoutId = null;
        }
        return;
    }

    chrome.storage.sync.get(['minDelay', 'maxDelay'], (settings) => {
        let minDelay = settings.minDelay || 2000;
        let maxDelay = settings.maxDelay || 3000;

        if (minDelay < 500) minDelay = 500;
        if (maxDelay < minDelay) maxDelay = minDelay; // 최대값이 최소값보다 작으면 최소값으로

        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        console.log(`다음 자동 실행 ${randomDelay}ms 후에 예약됨`);

        autoSendTimeoutId = setTimeout(async () => { // async 추가
            if (!isAutoSending || isPausedBySpamGuard) {
                console.log("Timeout 실행 시점: 자동 실행 비활성 또는 일시정지됨.");
                return; // Timeout 실행 시점에 상태 다시 확인
            }
            try {
                await sendEmoticonTriggerToActiveTab();
                // 성공 시에만 다음 실행 예약
                scheduleNextAutoSend();
            } catch (error) {
                console.error("자동 입력 중 오류 발생, 자동 입력 중지:", error.message);
                stopAutoSend(`오류 발생 (${error.message})`); // 오류 시 자동 중지
            }
        }, randomDelay);
    });
}

function startAutoSend() {
    if (isAutoSending && !isPausedBySpamGuard) return;

    isAutoSending = true;
    isPausedBySpamGuard = false;
    console.log(`자동 이모티콘 입력 시작 요청됨.`);
    updateIconBadge();
    showToastInActiveTab("자동 입력 시작됨");

    // Content script에 감시 시작 알림
    chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.chzzk.naver.com/*" }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "startAutoSendObservation" })
                 .catch(e => console.error("감시 시작 메시지 전송 실패:", e));
        }
    });

    scheduleNextAutoSend();
}

function stopAutoSend(reason = "사용자 요청") {
     if (!isAutoSending && !isPausedBySpamGuard) return;

    if (autoSendTimeoutId) {
        clearTimeout(autoSendTimeoutId);
        autoSendTimeoutId = null;
    }
    const wasPaused = isPausedBySpamGuard;
    isAutoSending = false;
    isPausedBySpamGuard = false;
    console.log(`자동 이모티콘 입력 중지 (${reason})`);
    updateIconBadge();
    if (reason === "사용자 요청" || !wasPaused) {
        showToastInActiveTab("자동 입력 중지됨");
    }

    // Content script에 감시 중지 알림
    chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.chzzk.naver.com/*" }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "stopAutoSendObservation" })
                 .catch(e => console.error("감시 중지 메시지 전송 실패:", e));
        }
    });
}

// 도배 방지 일시정지 함수 (Content Script가 요청)
function pauseAutoSendForSpamGuard() {
    if (!isAutoSending || isPausedBySpamGuard) return;
    isPausedBySpamGuard = true;
    if (autoSendTimeoutId) {
        clearTimeout(autoSendTimeoutId); // 예약된 timeout 취소
        autoSendTimeoutId = null;
    }
    console.log("자동 입력 일시정지 (도배 방지)");
    updateIconBadge();
    showToastInActiveTab("도배 방지: 자동 입력 일시정지됨");
    // Content script의 observer는 계속 동작함
}

// 도배 방지 해제 및 자동 입력 재개 함수 (Content Script가 요청)
function resumeAutoSendFromSpamGuard() {
    if (!isAutoSending || !isPausedBySpamGuard) return;
    isPausedBySpamGuard = false;
    console.log("자동 입력 재개 (도배 방지 해제)");
    updateIconBadge();
    showToastInActiveTab("자동 입력 재개됨");
    scheduleNextAutoSend(); // 다음 실행 예약 시작
    // Content script의 observer는 계속 동작함
}

// --- 메시지 핸들러 통합 및 확장 ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`Background 메시지 수신: ${message.action || message.type}`); // type도 허용

    // 비동기 처리를 위한 IIFE
    (async () => {
        try {
            switch (message.action || message.type) { // action 또는 type 사용
                case "getAutoSendStatus":
                    sendResponse({
                        isAutoSending: isAutoSending,
                        isPaused: isPausedBySpamGuard
                    });
                    break;
                case "settingsUpdated":
                    console.log("설정 변경 감지됨.");
                    // 다음 간격부터 자동 적용되므로 별도 처리 불필요
                    sendResponse({ success: true });
                    break;
                case "pauseAutoSend":
                    pauseAutoSendForSpamGuard();
                    sendResponse({ success: true });
                    break;
                case "resumeAutoSend":
                    resumeAutoSendFromSpamGuard();
                    sendResponse({ success: true });
                    break;

                // --- Content Script가 Main World와 상호작용하기 위한 핸들러 ---
                case "getVariable": {
                    if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
                    const [{ result }] = await chrome.scripting.executeScript({
                        target: { tabId: sender.tab.id },
                        func: (variableName) => window[variableName],
                        args: [message.value], // content에서 value로 변수 이름 전달
                        world: "MAIN"
                    }).catch(e => { console.error("getVariable 실패:", e); throw e; });
                    console.log(`getVariable (${message.value}):`, result);
                    sendResponse(result); // 결과 바로 전송
                    break;
                }
                case "setVariable": {
                     if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
                     await chrome.scripting.executeScript({
                        target: { tabId: sender.tab.id },
                        func: (name, value) => { window[name] = value; },
                        args: [message.value.name, message.value.value], // content에서 name, value 객체 전달
                        world: "MAIN"
                    }).catch(e => { console.error("setVariable 실패:", e); throw e; });
                    console.log(`setVariable (${message.value.name}) 완료`);
                    sendResponse({ success: true });
                    break;
                }
                 case "callWindowFunction": { // 새 핸들러: window 함수 호출
                     if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
                     const funcName = message.value.functionName;
                     const args = message.value.args || [];
                      console.log(`callWindowFunction (${funcName}) 호출 시도, Args:`, args);
                     const [{ result }] = await chrome.scripting.executeScript({
                        target: { tabId: sender.tab.id },
                        func: (name, funcArgs) => {
                            if (typeof window[name] === 'function') {
                                try {
                                    // console.log(`Executing window.${name} with args:`, funcArgs);
                                    return window[name](...funcArgs); // 함수 실행 및 결과 반환
                                } catch (e) {
                                    console.error(`Error executing window.${name}:`, e);
                                    return { error: e.message }; // 오류 반환
                                }
                            } else {
                                console.warn(`window.${name} is not a function.`);
                                return { error: `${name} is not a function` };
                            }
                        },
                        args: [funcName, args],
                        world: "MAIN"
                    }).catch(e => { console.error(`callWindowFunction (${funcName}) 실패:`, e); throw e; });
                    console.log(`callWindowFunction (${funcName}) 결과:`, result);
                    sendResponse(result); // 함수의 반환값 또는 오류 전송
                    break;
                }
                // --- End Main World Interaction Handlers ---

                default:
                    console.log("알 수 없는 메시지:", message);
                    sendResponse({ success: false, error: "Unknown action" });
                    break;
            }
        } catch (error) {
             console.error(`메시지 처리 중 오류 (${message.action || message.type}):`, error);
             // 오류 발생 시에도 응답을 보내도록 시도 (실패할 수도 있음)
             try {
                 sendResponse({ success: false, error: error.message });
             } catch (responseError) {
                 console.error("오류 응답 전송 실패:", responseError);
             }
        }
    })(); // 즉시 실행 비동기 함수

    // 비동기 작업을 처리하므로 항상 true 반환
    return true;
});


// 단축키 리스너 (수동 입력 로직 변경 없음)
chrome.commands.onCommand.addListener((command) => {
    if (command === "trigger-emoticon") {
        console.log("수동 입력 단축키 감지:", command);
        sendEmoticonTriggerToActiveTab(false)  // 수동 입력은 딜레이 체크 없이 바로 실행
            .catch(e => console.error("수동 입력 실패:", e));
    } else if (command === "toggle-auto-send") {
        console.log("자동 입력 토글 단축키 감지:", command);
        if (isAutoSending) {
            stopAutoSend();
        } else {
            startAutoSend();
        }
    }
});
