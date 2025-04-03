// --- 상수 정의 ---
const CONSTANTS = {
    DEFAULT_SETTINGS: {
        minRepetitions: 1,
        maxRepetitions: 1,
        minDelay: 2000,
        maxDelay: 3000
    },
    MIN_DELAY: 500,
    BADGE_COLORS: {
        DEFAULT: '#9E9E9E',
        PAUSED: '#FF9800',
        ACTIVE: '#4CAF50'
    },
    BADGE_TEXTS: {
        PAUSED: 'PAUSE',
        ACTIVE: 'ON',
        INACTIVE: ''
    }
};

// --- 상태 관리 ---
let state = {
    lastExecutionTime: 0,
    isAutoSending: false,
    isPausedBySpamGuard: false,
    autoSendTimeoutId: null,
    isExecuting: false
};

// --- Helper Functions ---

/**
 * 아이콘 배지를 업데이트합니다.
 */
function updateIconBadge() {
    const { isAutoSending, isPausedBySpamGuard } = state;
    let badgeText = CONSTANTS.BADGE_TEXTS.INACTIVE;
    let color = CONSTANTS.BADGE_COLORS.DEFAULT;

    if (isAutoSending) {
        if (isPausedBySpamGuard) {
            badgeText = CONSTANTS.BADGE_TEXTS.PAUSED;
            color = CONSTANTS.BADGE_COLORS.PAUSED;
        } else {
            badgeText = CONSTANTS.BADGE_TEXTS.ACTIVE;
            color = CONSTANTS.BADGE_COLORS.ACTIVE;
        }
    }

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color });
}

/**
 * 활성 탭에 토스트 메시지를 표시합니다.
 * @param {string} message - 표시할 메시지
 */
async function showToastInActiveTab(message) {
    try {
        const tabs = await chrome.tabs.query({ 
            active: true, 
            currentWindow: true, 
            url: "*://*.chzzk.naver.com/*" 
        });
        
        if (tabs.length > 0) {
            await chrome.tabs.sendMessage(tabs[0].id, { 
                action: "showToast", 
                message 
            });
        }
    } catch (error) {
        console.error("토스트 메시지 전송 실패:", error);
    }
}

/**
 * 활성 탭에 이모티콘 트리거를 전송합니다.
 * @param {boolean} isAuto - 자동 전송 여부
 * @returns {Promise<boolean>} 전송 성공 여부
 */
async function sendEmoticonTriggerToActiveTab(isAuto = true) {
    if (state.isExecuting) {
        console.log("이미 이모티콘 전송이 실행 중입니다.");
        throw new Error("이미 실행 중");
    }

    try {
        state.isExecuting = true;
        const tabs = await chrome.tabs.query({ 
            active: true, 
            currentWindow: true, 
            url: "*://*.chzzk.naver.com/*" 
        });

        if (tabs.length === 0) {
            throw new Error("활성 치지직 탭 없음");
        }

        const tabId = tabs[0].id;
        console.log(`탭 (${tabId})에 이모티콘 트리거 전송 (${isAuto ? '자동' : '수동'})`);

        const response = await chrome.tabs.sendMessage(tabId, { 
            action: "injectAndSendTrigger", 
            isAuto 
        });

        if (!response?.success) {
            throw new Error("Content script failed");
        }

        return true;
    } catch (error) {
        console.error("이모티콘 트리거 전송 실패:", error);
        throw error;
    } finally {
        state.isExecuting = false;
    }
}

/**
 * 다음 자동 실행을 예약합니다.
 */
function scheduleNextAutoSend() {
    const { isAutoSending, isPausedBySpamGuard, autoSendTimeoutId } = state;

    if (!isAutoSending || isPausedBySpamGuard) {
        console.log("다음 자동 실행 예약 중지됨 (비활성 또는 일시정지).");
        if (autoSendTimeoutId) {
            clearTimeout(autoSendTimeoutId);
            state.autoSendTimeoutId = null;
        }
        return;
    }

    chrome.storage.sync.get(['minDelay', 'maxDelay'], (settings) => {
        let minDelay = Math.max(CONSTANTS.MIN_DELAY, settings.minDelay || CONSTANTS.DEFAULT_SETTINGS.minDelay);
        let maxDelay = Math.max(minDelay, settings.maxDelay || CONSTANTS.DEFAULT_SETTINGS.maxDelay);

        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        console.log(`다음 자동 실행 ${randomDelay}ms 후에 예약됨`);

        state.autoSendTimeoutId = setTimeout(async () => {
            if (!state.isAutoSending || state.isPausedBySpamGuard) {
                console.log("Timeout 실행 시점: 자동 실행 비활성 또는 일시정지됨.");
                return;
            }

            try {
                await sendEmoticonTriggerToActiveTab();
                scheduleNextAutoSend();
            } catch (error) {
                console.error("자동 입력 중 오류 발생, 자동 입력 중지:", error.message);
                stopAutoSend(`오류 발생 (${error.message})`);
            }
        }, randomDelay);
    });
}

// --- 이벤트 리스너 ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(Object.keys(CONSTANTS.DEFAULT_SETTINGS), (result) => {
        const updates = {};
        Object.entries(CONSTANTS.DEFAULT_SETTINGS).forEach(([key, value]) => {
            if (result[key] === undefined) {
                updates[key] = value;
            }
        });
        
        if (Object.keys(updates).length > 0) {
            chrome.storage.sync.set(updates);
        }
    });
    console.log('이모티콘 도우미 설치/업데이트됨. 기본 설정 확인.');
    updateIconBadge();
});

chrome.runtime.onStartup.addListener(() => {
    state = {
        ...state,
        isAutoSending: false,
        isPausedBySpamGuard: false,
        autoSendTimeoutId: null
    };
    updateIconBadge();
});

function startAutoSend() {
    if (state.isAutoSending && !state.isPausedBySpamGuard) return;

    state.isAutoSending = true;
    state.isPausedBySpamGuard = false;
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
     if (!state.isAutoSending && !state.isPausedBySpamGuard) return;

    if (state.autoSendTimeoutId) {
        clearTimeout(state.autoSendTimeoutId);
        state.autoSendTimeoutId = null;
    }
    const wasPaused = state.isPausedBySpamGuard;
    state.isAutoSending = false;
    state.isPausedBySpamGuard = false;
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
    if (!state.isAutoSending || state.isPausedBySpamGuard) return;
    state.isPausedBySpamGuard = true;
    if (state.autoSendTimeoutId) {
        clearTimeout(state.autoSendTimeoutId); // 예약된 timeout 취소
        state.autoSendTimeoutId = null;
    }
    console.log("자동 입력 일시정지 (도배 방지)");
    updateIconBadge();
    showToastInActiveTab("도배 방지: 자동 입력 일시정지됨");
    // Content script의 observer는 계속 동작함
}

// 도배 방지 해제 및 자동 입력 재개 함수 (Content Script가 요청)
function resumeAutoSendFromSpamGuard() {
    if (!state.isAutoSending || !state.isPausedBySpamGuard) return;
    state.isPausedBySpamGuard = false;
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
                        isAutoSending: state.isAutoSending,
                        isPaused: state.isPausedBySpamGuard
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


// 단축키 리스너 수정
chrome.commands.onCommand.addListener((command) => {
    if (command === "trigger-emoticon") {
        console.log("수동 입력 단축키 감지:", command);
        
        // 이미 실행 중이면 무시
        if (state.isExecuting) {
            console.log("이미 이모티콘 전송이 실행 중입니다.");
            showToastInActiveTab("이모티콘 전송이 실행 중입니다");
            return;
        }

        const currentTime = Date.now();
        const manualDelay = 1000; // 수동 입력 딜레이 1초로 설정

        if (currentTime - state.lastExecutionTime >= manualDelay) {
            sendEmoticonTriggerToActiveTab(false)  // 수동 입력
                .then(() => {
                    state.lastExecutionTime = Date.now(); // 성공 시에만 시간 갱신
                }).catch(e => console.error("수동 입력 실패:", e));
        } else {
            console.log(`수동 입력 딜레이(${manualDelay}ms) 대기 중...`);
        }
    } else if (command === "toggle-auto-send") {
        console.log("자동 입력 토글 단축키 감지:", command);
        if (state.isAutoSending) {
            stopAutoSend();
        } else {
            startAutoSend();
        }
    }
});
