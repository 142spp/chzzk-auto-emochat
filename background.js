// --- 상수 정의 ---
const CONSTANTS = {
    DEFAULT_SETTINGS: {
        minRepetitions: 1,
        maxRepetitions: 1,
        minDelay: 2000,
        maxDelay: 3000
    },
    STORAGE_KEYS: {
        SETTINGS: 'settings'
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
    CHZZK_URL_PATTERN: "*://*.chzzk.naver.com/*"
};

// --- 상태 관리 클래스 ---
class StateManager {
    constructor() {
        this.state = {
            lastExecutionTime: 0,
            isAutoSending: false,
            autoSendTimeoutId: null,
            isExecuting: false
        };
    }

    get isAutoSending() {
        return this.state.isAutoSending;
    }

    set isAutoSending(value) {
        this.state.isAutoSending = value;
        this.updateIconBadge();
    }

    get isExecuting() {
        return this.state.isExecuting;
    }

    set isExecuting(value) {
        this.state.isExecuting = value;
    }

    clearAutoSendTimeout() {
        if (this.state.autoSendTimeoutId) {
            clearTimeout(this.state.autoSendTimeoutId);
            this.state.autoSendTimeoutId = null;
        }
    }

    updateIconBadge() {
        const badgeText = this.state.isAutoSending ? CONSTANTS.BADGE_TEXTS.ACTIVE : CONSTANTS.BADGE_TEXTS.INACTIVE;
        const color = this.state.isAutoSending ? CONSTANTS.BADGE_COLORS.ACTIVE : CONSTANTS.BADGE_COLORS.DEFAULT;

        chrome.action.setBadgeText({ text: badgeText });
        chrome.action.setBadgeBackgroundColor({ color });
    }
}

// --- 유틸리티 클래스 ---
class TabUtils {
    static async getActiveChzzkTab() {
        const tabs = await chrome.tabs.query({ 
            active: true, 
            currentWindow: true, 
            url: CONSTANTS.CHZZK_URL_PATTERN 
        });
        
        if (tabs.length === 0) {
            throw new Error("활성 치지직 탭이 없습니다.");
        }
        
        return tabs[0];
    }

    static async showToastInActiveTab(message) {
        try {
            const tab = await this.getActiveChzzkTab();
            await chrome.tabs.sendMessage(tab.id, { 
                action: "showToast", 
                message 
            });
        } catch (error) {
            console.error("토스트 메시지 전송 실패:", error);
        }
    }

    static async sendEmoticonTriggerToActiveTab(isAuto = true) {
        try {
            const tab = await this.getActiveChzzkTab();
            const response = await chrome.tabs.sendMessage(tab.id, { 
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
        }
    }
}

// --- 메시지 핸들러 클래스 ---
class MessageHandler {
    constructor(stateManager) {
        this.stateManager = stateManager;
    }

    async handleMessage(message, sender, sendResponse) {
        console.log(`Background 메시지 수신: ${message.action || message.type}`);

        try {
            switch (message.action || message.type) {
                case "getAutoSendStatus":
                    return { isAutoSending: this.stateManager.isAutoSending };
                
                case "settingsUpdated":
                    console.log("설정 변경 감지됨.");
                    return { success: true };

                case "getVariable":
                    return await this.handleGetVariable(message, sender);
                
                case "setVariable":
                    return await this.handleSetVariable(message, sender);
                
                case "callWindowFunction":
                    return await this.handleCallWindowFunction(message, sender);
                
                default:
                    console.warn("알 수 없는 메시지 타입:", message.action || message.type);
                    return { success: false, error: "알 수 없는 메시지 타입" };
            }
        } catch (error) {
            console.error("메시지 처리 중 오류 발생:", error);
            return { success: false, error: error.message };
        }
    }

    async handleGetVariable(message, sender) {
        if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
        
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (variableName) => window[variableName],
            args: [message.value],
            world: "MAIN"
        });
        
        console.log(`getVariable (${message.value}):`, result);
        return result;
    }

    async handleSetVariable(message, sender) {
        if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
        
        await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (name, value) => { window[name] = value; },
            args: [message.value.name, message.value.value],
            world: "MAIN"
        });
        
        console.log(`setVariable (${message.value.name}) 완료`);
        return { success: true };
    }

    async handleCallWindowFunction(message, sender) {
        if (!sender?.tab?.id) throw new Error("Sender Tab ID 없음");
        
        const funcName = message.value.functionName;
        const args = message.value.args || [];
        
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (funcName, args) => {
                const func = window[funcName];
                if (typeof func !== 'function') {
                    throw new Error(`함수를 찾을 수 없음: ${funcName}`);
                }
                return func.apply(window, args);
            },
            args: [funcName, args],
            world: "MAIN"
        });
        
        return result;
    }
}

// --- 자동 전송 관리 클래스 ---
class AutoSendManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
    }

    async startAutoSend() {
        if (this.stateManager.isAutoSending) return;

        this.stateManager.isAutoSending = true;
        console.log("자동 이모티콘 입력 시작 요청됨.");
        await TabUtils.showToastInActiveTab("자동 입력 시작됨");
        this.scheduleNextAutoSend();
    }

    stopAutoSend(reason = "사용자 요청") {
        if (!this.stateManager.isAutoSending) return;

        this.stateManager.clearAutoSendTimeout();
        this.stateManager.isAutoSending = false;
        console.log(`자동 이모티콘 입력 중지 (${reason})`);
        TabUtils.showToastInActiveTab("자동 입력 중지됨");
    }

    async scheduleNextAutoSend() {
        if (!this.stateManager.isAutoSending) {
            console.log("다음 자동 실행 예약 중지됨 (비활성).");
            return;
        }

        const settings = await chrome.storage.sync.get([CONSTANTS.STORAGE_KEYS.SETTINGS]).then(result => result[CONSTANTS.STORAGE_KEYS.SETTINGS]) || CONSTANTS.DEFAULT_SETTINGS;
        const minDelay = Math.max(CONSTANTS.MIN_DELAY, settings.minDelay);
        const maxDelay = Math.max(minDelay, settings.maxDelay);
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

        console.log(`다음 자동 실행 ${randomDelay}ms 후에 예약됨`);

        this.stateManager.state.autoSendTimeoutId = setTimeout(async () => {
            if (!this.stateManager.isAutoSending) {
                console.log("Timeout 실행 시점: 자동 실행 비활성됨.");
                return;
            }

            try {
                await TabUtils.sendEmoticonTriggerToActiveTab(true);
                this.scheduleNextAutoSend();
            } catch (error) {
                console.error("자동 입력 중 오류 발생, 자동 입력 중지:", error.message);
                this.stopAutoSend(`오류 발생 (${error.message})`);
            }
        }, randomDelay);
    }
}

// --- 초기화 및 이벤트 리스너 ---
const stateManager = new StateManager();
const messageHandler = new MessageHandler(stateManager);
const autoSendManager = new AutoSendManager(stateManager);

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(Object.keys(CONSTANTS.DEFAULT_SETTINGS), (result) => {
        const updates = {};
        for (const [key, value] of Object.entries(CONSTANTS.DEFAULT_SETTINGS)) {
            if (result[key] === undefined) {
                updates[key] = value;
            }
        }
        
        if (Object.keys(updates).length > 0) {
            chrome.storage.sync.set(updates);
        }
    });
    console.log('이모티콘 도우미 설치/업데이트됨. 기본 설정 확인.');
    stateManager.updateIconBadge();

    chrome.contextMenus.create({
        id: "addEmoticonToCache",
        title: "이모티콘 추가",
        contexts: ["image"],
        documentUrlPatterns: ["https://chzzk.naver.com/*"]
    });
});

chrome.runtime.onStartup.addListener(() => {
    stateManager.state = {
        ...stateManager.state,
        isAutoSending: false,
        autoSendTimeoutId: null
    };
    stateManager.updateIconBadge();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    messageHandler.handleMessage(message, sender, sendResponse)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 비동기 응답을 위해 true 반환
});

// 단축키 핸들러
chrome.commands.onCommand.addListener((command) => {
    if (command === "trigger-emoticon") {
        console.log("수동 이모티콘 전송 단축키 감지:", command);
        const currentTime = Date.now();

        if (stateManager.isExecuting) {
            console.log("이미 이모티콘 전송이 실행 중입니다.");
            TabUtils.showToastInActiveTab("이모티콘 전송이 실행 중입니다");
            return;
        }

        if (currentTime - stateManager.state.lastExecutionTime >= CONSTANTS.MANUAL_DELAY) {
            stateManager.isExecuting = true;
            TabUtils.sendEmoticonTriggerToActiveTab(false)
                .then(() => {
                    stateManager.state.lastExecutionTime = Date.now();
                })
                .catch(e => console.error("수동 입력 실패:", e))
                .finally(() => {
                    stateManager.isExecuting = false;
                });
        } else {
            console.log("수동 입력 간격이 너무 짧습니다.");
            TabUtils.showToastInActiveTab("잠시 후 다시 시도해주세요");
        }
    } else if (command === "toggle-auto-send") {
        console.log("자동 입력 토글 단축키 감지:", command);
        if (stateManager.isAutoSending) {
            autoSendManager.stopAutoSend();
        } else {
            autoSendManager.startAutoSend();
        }
    }
});

// 컨텍스트 메뉴 클릭 처리
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "addEmoticonToCache") {
        // DOM에서 alt 값을 가져오기 위해 content script에 메시지 전송
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (srcUrl) => {
                const img = document.querySelector(`img[src="${srcUrl}"]`);
                return img ? img.alt.replace(/[{},:]/g, '') : null;
            },
            args: [info.srcUrl]
        }).then(([{ result: alt }]) => {
            chrome.tabs.sendMessage(tab.id, {
                action: "addEmoticonToCache",
                emoticonData : {
                    url: info.srcUrl,
                    name: alt
                }
            });
        });
    }
});
