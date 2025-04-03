// --- 상수 정의 ---
const CONSTANTS = {
    DEFAULT_SETTINGS: {
        minRepetitions: 1,
        maxRepetitions: 1,
        minDelay: 2000,
        maxDelay: 3000
    },
    MIN_DELAY: 500,
    MANUAL_DELAY: 1000, // 수동 입력 딜레이
    BADGE_COLORS: {
        DEFAULT: '#9E9E9E',
        ACTIVE: '#4CAF50'
    },
    BADGE_TEXTS: {
        ACTIVE: 'ON',
        INACTIVE: ''
    },
    CACHE: {
        KEY: 'emoticonCache',
        EXPIRY_TIME: 30 * 24 * 60 * 60 * 1000, // 30일
        VERSION: 1
    }
};

// --- 상태 관리 ---
let state = {
    lastExecutionTime: 0,
    isAutoSending: false,
    autoSendTimeoutId: null,
    isExecuting: false,
    emoticonCache: null
};

// --- Helper Functions ---

/**
 * 아이콘 배지를 업데이트합니다.
 */
function updateIconBadge() {
    const { isAutoSending } = state;
    let badgeText = CONSTANTS.BADGE_TEXTS.INACTIVE;
    let color = CONSTANTS.BADGE_COLORS.DEFAULT;

    if (isAutoSending) {
        badgeText = CONSTANTS.BADGE_TEXTS.ACTIVE;
        color = CONSTANTS.BADGE_COLORS.ACTIVE;
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
    const { isAutoSending, autoSendTimeoutId } = state;

    if (!isAutoSending) {
        console.log("다음 자동 실행 예약 중지됨 (비활성).");
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
            if (!state.isAutoSending) {
                console.log("Timeout 실행 시점: 자동 실행 비활성됨.");
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

/**
 * 이모티콘 캐시를 초기화합니다.
 */
async function initializeEmoticonCache() {
    try {
        const result = await chrome.storage.local.get([CONSTANTS.CACHE.KEY]);
        const cache = result[CONSTANTS.CACHE.KEY];

        if (cache && 
            cache.version === CONSTANTS.CACHE.VERSION && 
            Date.now() - cache.lastUpdated < CONSTANTS.CACHE.EXPIRY_TIME) {
            state.emoticonCache = cache;
            console.log('이모티콘 캐시 로드 완료');
            return true;
        }

        // 캐시가 없거나 만료된 경우
        state.emoticonCache = {
            version: CONSTANTS.CACHE.VERSION,
            lastUpdated: Date.now(),
            emoticons: {}
        };
        await chrome.storage.local.set({ [CONSTANTS.CACHE.KEY]: state.emoticonCache });
        console.log('이모티콘 캐시 초기화 완료');
        return true;
    } catch (error) {
        console.error('이모티콘 캐시 초기화 실패:', error);
        return false;
    }
}

/**
 * 이모티콘 캐시를 업데이트합니다.
 * @param {Object} emoticonData - 새로운 이모티콘 데이터
 */
async function updateEmoticonCache(emoticonData) {
    try {
        if (!state.emoticonCache) {
            await initializeEmoticonCache();
        }

        state.emoticonCache = {
            version: CONSTANTS.CACHE.VERSION,
            lastUpdated: Date.now(),
            emoticons: emoticonData
        };

        await chrome.storage.local.set({ [CONSTANTS.CACHE.KEY]: state.emoticonCache });
        console.log('이모티콘 캐시 업데이트 완료');
        return true;
    } catch (error) {
        console.error('이모티콘 캐시 업데이트 실패:', error);
        return false;
    }
}

/**
 * 이모티콘 캐시를 가져옵니다.
 * @returns {Object|null} 캐시된 이모티콘 데이터
 */
function getEmoticonCache() {
    if (!state.emoticonCache) {
        console.log('캐시가 초기화되지 않음');
        return null;
    }

    const { version, lastUpdated, emoticons } = state.emoticonCache;
    // 버전 검증
    if (version !== CONSTANTS.CACHE.VERSION) {
        console.log('캐시 버전 불일치');
        return null;
    }
    // 만료 시간 검증
    if (Date.now() - lastUpdated > CONSTANTS.CACHE.EXPIRY_TIME) {
        console.log('캐시 만료됨');
        return null;
    }
    // 이모티콘 데이터 유효성 검증
    if (!emoticons || typeof emoticons !== 'object' || Object.keys(emoticons).length === 0) {
        console.log('캐시된 이모티콘 데이터가 유효하지 않음');
        return null;
    }

    console.log('유효한 캐시 데이터 반환');
    return emoticons;
}

// --- 이벤트 리스너 ---
chrome.runtime.onInstalled.addListener(async () => {
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
    await initializeEmoticonCache();
    console.log('이모티콘 도우미 설치/업데이트됨. 기본 설정 확인.');
    updateIconBadge();
});

chrome.runtime.onStartup.addListener(() => {
    state = {
        ...state,
        isAutoSending: false,
        autoSendTimeoutId: null
    };
    updateIconBadge();
});

function startAutoSend() {
    if (state.isAutoSending) return;

    state.isAutoSending = true;
    console.log(`자동 이모티콘 입력 시작 요청됨.`);
    updateIconBadge();
    showToastInActiveTab("자동 입력 시작됨");
    scheduleNextAutoSend();
}

function stopAutoSend(reason = "사용자 요청") {
    if (!state.isAutoSending) return;

    if (state.autoSendTimeoutId) {
        clearTimeout(state.autoSendTimeoutId);
        state.autoSendTimeoutId = null;
    }
    state.isAutoSending = false;
    console.log(`자동 이모티콘 입력 중지 (${reason})`);
    updateIconBadge();
    showToastInActiveTab("자동 입력 중지됨");
}

// --- 메시지 핸들러 ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`Background 메시지 수신: ${message.action || message.type}`);

    // 비동기 처리를 위한 IIFE
    (async () => {
        try {
            switch (message.action || message.type) {
                case "getAutoSendStatus":
                    sendResponse({
                        isAutoSending: state.isAutoSending
                    });
                    break;
                case "settingsUpdated":
                    console.log("설정 변경 감지됨.");
                    sendResponse({ success: true });
                    break;

                // --- Content Script가 Main World와 상호작용하기 위한 핸들러 ---
                case "getVariable": {
                    if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
                    const [{ result }] = await chrome.scripting.executeScript({
                        target: { tabId: sender.tab.id },
                        func: (variableName) => window[variableName],
                        args: [message.value],
                        world: "MAIN"
                    }).catch(e => { console.error("getVariable 실패:", e); throw e; });
                    console.log(`getVariable (${message.value}):`, result);
                    sendResponse(result);
                    break;
                }
                case "setVariable": {
                    if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
                    await chrome.scripting.executeScript({
                        target: { tabId: sender.tab.id },
                        func: (name, value) => { window[name] = value; },
                        args: [message.value.name, message.value.value],
                        world: "MAIN"
                    }).catch(e => { console.error("setVariable 실패:", e); throw e; });
                    console.log(`setVariable (${message.value.name}) 완료`);
                    sendResponse({ success: true });
                    break;
                }
                case "callWindowFunction": {
                    if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
                    const funcName = message.value.functionName;
                    const args = message.value.args || [];
                    console.log(`callWindowFunction (${funcName}) 호출 시도, Args:`, args);
                    const [{ result }] = await chrome.scripting.executeScript({
                        target: { tabId: sender.tab.id },
                        func: (name, funcArgs) => {
                            if (typeof window[name] === 'function') {
                                try {
                                    return window[name](...funcArgs);
                                } catch (e) {
                                    console.error(`Error executing window.${name}:`, e);
                                    return { error: e.message };
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
                    sendResponse(result);
                    break;
                }
                case "getEmoticonCache":
                    sendResponse({
                        success: true,
                        cache: getEmoticonCache()
                    });
                    break;
                case "updateEmoticonCache":
                    const success = await updateEmoticonCache(message.data);
                    sendResponse({ success });
                    break;

                default:
                    console.log("알 수 없는 메시지:", message);
                    sendResponse({ success: false, error: "Unknown action" });
                    break;
            }
        } catch (error) {
            console.error(`메시지 처리 중 오류 (${message.action || message.type}):`, error);
            try {
                sendResponse({ success: false, error: error.message });
            } catch (responseError) {
                console.error("오류 응답 전송 실패:", responseError);
            }
        }
    })();
});

// 단축키 핸들러
chrome.commands.onCommand.addListener((command) => {
    if (command === "trigger-emoticon") {
        console.log("수동 이모티콘 전송 단축키 감지:", command);
        const currentTime = Date.now();

        if (state.isExecuting) {
            console.log("이미 이모티콘 전송이 실행 중입니다.");
            showToastInActiveTab("이모티콘 전송이 실행 중입니다");
            return;
        }

        if (currentTime - state.lastExecutionTime >= CONSTANTS.MANUAL_DELAY) {
            sendEmoticonTriggerToActiveTab(false)
                .then(() => {
                    state.lastExecutionTime = Date.now();
                }).catch(e => console.error("수동 입력 실패:", e));
        } else {
            console.log("수동 입력 간격이 너무 짧습니다.");
            showToastInActiveTab("잠시 후 다시 시도해주세요");
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
