/**
 * content.js - 치지직 랜덤 이모티콘 도우미 (v7 - 모듈화 및 에러 처리 개선)
 * 기능:
 * - 설정된 최소/최대 횟수 범위 내 랜덤 횟수로 이모티콘 반복 입력
 * - 이미지 이모티콘 사용 (DOM 직접 조작 및 input 이벤트 발생)
 * - Main World 변수(__workingChat, __workingEmoticon) 업데이트 시도
 * - 자동 입력 (Background 제어), 랜덤 간격
 * - 토스트 메시지 표시
 */
console.log("치지직 이모티콘 도우미 content script 로드됨 (v7).");

// --- 상수 정의 ---
const CONSTANTS = {
    SELECTORS: {
        CHAT_INPUT: "pre.live_chatting_input_input__2F3Et[contenteditable='true']",
        INPUT_CONTAINER: ".live_chatting_input_container__qA0ad"
    },
    STORAGE_KEYS: {
        EMOTICON_CACHE: 'emoticonCache',
        SETTINGS: 'settings'
    },
    TOAST: {
        DURATION: 2500,
        ID: 'chzzkMacroToast'
    },
    AUTO_SEND_DELAY: 150,
    MAIN_WORLD_VARS: {
        WORKING_CHAT: '__workingChat',
        WORKING_EMOTICON: '__workingEmoticon'
    },
    DEFAULT_EMOTICONS: [
        { name: 'd_59', url: 'https://ssl.pstatic.net/static/nng/glive/icon/b_19.gif' },
        { name: 'd_60', url: 'https://ssl.pstatic.net/static/nng/glive/icon/b_20.gif' },
        { name: 'd_61', url: 'https://ssl.pstatic.net/static/nng/glive/icon/b_21.gif' },
        { name: 'd_62', url: 'https://ssl.pstatic.net/static/nng/glive/icon/b_22.gif' },
    ]
};

// --- 이모티콘 관리 클래스 ---
class EmoticonManager {
    constructor() {
        this.cachedEmoticons = null; // 기본값으로 초기화
        this.previousIndex = -1;
        this.previousRepetitions = 0;
    }
    /**
     * 스토리지에서 이모티콘 데이터와 선택 상태를 로드합니다.
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]).then(result => result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || []);
            if (result && Array.isArray(result)) this.cachedEmoticons = result;
            else this.cachedEmoticons = CONSTANTS.DEFAULT_EMOTICONS;
        } catch (error) {
            console.error('이모티콘 초기화 중 오류:', error);
            UIManager.showToast('이모티콘 초기화 중 오류 발생');
        }
    }
    /**
     * 사용 가능한 이모티콘 목록을 반환합니다. (선택된 이모티콘만)
     * @returns {Array} 사용 가능한 이모티콘 배열
     */
    getAvailableEmoticons() {
        const selectedEmoticons = this.cachedEmoticons.filter(emoticon => emoticon.selected);
        if (selectedEmoticons.length === 0) {
            return [...this.cachedEmoticons];
        }
        return selectedEmoticons;
    } 
    /**
     * 이모티콘 데이터를 준비합니다.
     * @returns {Promise<{success: boolean, data?: {editableArea: Element, newHtmlString: string, newWorkingChat: string, newEmoticonMap: Object}, error?: string}>}
    */
    async prepareEmoticons() {
        const MAX_RETRIES = 5;
        try {
            const settings = await chrome.storage.sync.get([CONSTANTS.STORAGE_KEYS.SETTINGS]).then(result => result[CONSTANTS.STORAGE_KEYS.SETTINGS] || {});
            const availableEmoticons = this.getAvailableEmoticons();
            if (availableEmoticons.length === 0) {
                throw new Error("사용 가능한 이모티콘이 없습니다.");
            }
            const minReps = Math.max(1, settings.minRepetitions || 1);
            const maxReps = Math.max(minReps, settings.maxRepetitions || 1);
            let retryCount = 0, actualRepetitions, randomIndex;
            do {
                actualRepetitions = Math.floor(Math.random() * (maxReps - minReps + 1)) + minReps;
                randomIndex = Math.floor(Math.random() * availableEmoticons.length);
                if (actualRepetitions === this.previousRepetitions && randomIndex === this.previousIndex) retryCount++;
                else break;
            } while (retryCount < MAX_RETRIES);

            if (retryCount === MAX_RETRIES) {
                console.warn(`최대 재시도 (${MAX_RETRIES}회) 초과. 동일한 이모티콘/반복으로 진행합니다.`);
            }
            this.previousRepetitions = actualRepetitions;
            this.previousIndex = randomIndex;

            const chosenEmoticon = availableEmoticons[randomIndex];
            const { name, url } = chosenEmoticon;
            const placeholder = `{:${name}:}`;

            const chatInputContainer = document.querySelector(CONSTANTS.SELECTORS.INPUT_CONTAINER);
            const editableArea = chatInputContainer?.querySelector(CONSTANTS.SELECTORS.CHAT_INPUT);

            if (!editableArea) {
                throw new Error("채팅 입력 영역을 찾을 수 없습니다.");
            }

            const currentChatVar = await MainWorldManager.getVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT) ?? "";
            const currentEmoticonMap = await MainWorldManager.getVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_EMOTICON) ?? {};

            const emoticonHtml = `<img src="${url}" title="${placeholder}" alt="${placeholder}" style="vertical-align: middle; height: 20px; margin: 0 1px;">`;
            const newHtmlString = currentChatVar + emoticonHtml.repeat(actualRepetitions);
            const newWorkingChat = currentChatVar + placeholder.repeat(actualRepetitions);
            const newEmoticonMap = { ...currentEmoticonMap };

            if (!newEmoticonMap[name]) {
                newEmoticonMap[name] = url;
            }
            return {
                success: true,
                data: {
                    editableArea,
                    newHtmlString,
                    newWorkingChat,
                    newEmoticonMap
                }
            };
        } catch (error) {
            console.error("이모티콘 데이터 준비 중 오류 발생:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * 이모티콘을 전송합니다.
     * @param {boolean} isAuto - 자동 전송 여부
     * @returns {Promise<boolean>} 전송 성공 여부
    */
    async sendRandomEmoticons(isAuto = false) {
        try {
            const prepared = await this.prepareEmoticons();
            if (!prepared.success) return false;
            const { editableArea, newHtmlString, newWorkingChat, newEmoticonMap } = prepared.data;
            editableArea.focus();
            editableArea.innerHTML = newHtmlString;
            editableArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            if (typeof await MainWorldManager.getVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT) !== 'undefined') {
                await MainWorldManager.setVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT, newWorkingChat);
                await MainWorldManager.setVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_EMOTICON, newEmoticonMap);
            }
            if (isAuto) {
                await new Promise(resolve => setTimeout(resolve, CONSTANTS.AUTO_SEND_DELAY));
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            editableArea.dispatchEvent(new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true
            }));
            editableArea.innerHTML = "";
            editableArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            if (typeof await MainWorldManager.getVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT) !== 'undefined') {
                await MainWorldManager.setVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT, "");
                await MainWorldManager.setVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_EMOTICON, {});
            }
            return true;
        } catch (error) {
            console.error("이모티콘 전송 중 오류 발생:", error);
            return false;
        }
    }
    /**
    * 이모티콘 데이터를 캐시에 추가합니다.
    * @param {Object} emoticonData - 추가할 이모티콘 데이터 객체
    * @returns {Promise<void>}
    * @throws {Error} 캐시에 추가하는 중 오류가 발생할 경우
    */
    async addEmoticonToCache(emoticonData) {
        try {
            // 중복 체크
            const isDuplicate = this.cachedEmoticons.some(item =>
                item.name === emoticonData.name &&
                item.url === emoticonData.url
            );
            if (!isDuplicate) {
                this.cachedEmoticons.push({ ...emoticonData, selected: true });
                await chrome.storage.local.set({
                    [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: this.cachedEmoticons
                });
            } else {
                throw new Error('이모티콘이 이미 캐시에 존재합니다.');
            }
        } catch (error) {
            throw error;
        }
    }
    /**
     * 컨텍스트 메뉴에서 이모티콘을 캐시에 추가합니다.
     * @param {Object} emoticonData - 추가할 이모티콘 데이터 객체 ({ url: string, name: string })
     * @returns {Promise<void>}
     */
    async handleContextMenuAdd(emoticonData) {
        try {
            // emoticonData 객체 유효성 검사 추가
            if (!emoticonData || !emoticonData.url || !emoticonData.name) {
                throw new Error("잘못된 이모티콘 데이터 형식입니다.");
            }
            await this.addEmoticonToCache(emoticonData);
            UIManager.showToast('이모티콘이 캐시에 추가되었습니다.');
        } catch (error) {
            UIManager.showToast(`이모티콘 추가 중 오류: ${error.message}`);
        }
    }
}

// --- Main World 관리 클래스 ---
class MainWorldManager {
    /**
     * Main World의 변수 값을 가져옵니다.
     * @param {string} variableName - 변수 이름
     * @returns {Promise<any>}
     */
    static async getVariable(variableName) {
        try {
            return await chrome.runtime.sendMessage({ type: "getVariable", value: variableName });
        } catch (error) {
            console.error(`Main World 변수 가져오기 실패 (${variableName}):`, error);
            return undefined;
        }
    }

    /**
     * Main World의 변수 값을 설정합니다.
     * @param {string} variableName - 변수 이름
     * @param {any} value - 설정할 값
     * @returns {Promise<boolean>}
     */
    static async setVariable(variableName, value) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "setVariable",
                value: { name: variableName, value: value }
            });
            return response && response.success;
        } catch (error) {
            console.error(`Main World 변수 설정 실패 (${variableName}):`, error);
            return false;
        }
    }
}

// --- UI 관리 클래스 ---
class UIManager {
    /**
     * 토스트 메시지를 표시합니다.
     * @param {string} message - 메시지 내용
     * @param {number} [duration=2500] - 표시 시간 (ms)
     */
    static showToast(message, duration = CONSTANTS.TOAST.DURATION) {
        const existingToast = document.getElementById(CONSTANTS.TOAST.ID);
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.id = CONSTANTS.TOAST.ID;
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            zIndex: '9999',
            fontSize: '14px',
            opacity: '0',
            transition: 'opacity 0.3s ease-in-out'
        });

        document.body.appendChild(toast);

        // Fade-in
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 50);

        // Fade-out and remove
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, duration);
    }
}

// --- 메시지 핸들러 클래스 ---
class MessageHandler {
    constructor(emoticonManager) {
        this.emoticonManager = emoticonManager;
    }

    /**
     * 메시지를 처리합니다.
     * @param {Object} message - 메시지 객체
     * @param {Object} sender - 송신자 정보
     * @param {Function} sendResponse - 응답 함수
     */
    async handleMessage(message, sender, sendResponse) {
        console.log(`메시지 수신: [${message.action}]`, message);

        try {
            switch (message.action) {
                // 토스트 메시지 표시 요청 처리
                case "showToast":
                    UIManager.showToast(message.message);
                    sendResponse({ success: true });
                    break;

                // 이모티콘 전송 요청 처리 (자동/수동)
                case "injectAndSendTrigger":
                    console.log(`이모티콘 전송 요청 (자동: ${message.isAuto})`);
                    const success = await this.emoticonManager.sendRandomEmoticons(message.isAuto);
                    if (success) console.log("이모티콘 전송 성공");
                    else console.error("이모티콘 전송 실패");
                    sendResponse({ success });
                    break;

                // 이모티콘 목록 요청 처리 (팝업에서 호출)
                case "getEmoticons":
                    console.log("이모티콘 목록 요청됨");
                    sendResponse({ 
                        emoticons: this.emoticonManager.cachedEmoticons,
                    });
                    console.log(`이모티콘 목록 응답: ${this.emoticonManager.cachedEmoticons.length}개 캐시됨`);
                    break;

                // 이모티콘 캐시 추가 요청 처리 (컨텍스트 메뉴)
                case "addEmoticonToCache":
                    console.log("이모티콘 추가 요청됨:", message.emoticonData);
                    await this.emoticonManager.handleContextMenuAdd(message.emoticonData);
                    sendResponse({ success: true });
                    break;

                // 캐시 업데이트 알림 수신 (팝업에서 호출)
                case "emoticonCacheUpdated":
                    console.log("캐시 업데이트 알림 수신 - 캐시 다시 로드");
                    await this.emoticonManager.initialize();
                    sendResponse({ success: true });
                    break;
                    
                // 선택된 이모티콘 인덱스 업데이트 요청 (팝업에서 호출)
                case "updateSelectedEmoticons":
                    console.log(`선택된 이모티콘 업데이트 요청: ${message.selectedIndices?.length || 0}개`);
                    
                    if (Array.isArray(message.selectedIndices)) {
                        await this.emoticonManager.updateSelectedEmoticons(message.selectedIndices);
                        sendResponse({ 
                            success: true,
                            message: `${message.selectedIndices.length}개 이모티콘 선택됨`
                        });
                    } else {
                        console.error("잘못된 selectedIndices 형식:", message.selectedIndices);
                        sendResponse({ 
                            success: false, 
                            error: "올바르지 않은 선택 인덱스 형식" 
                        });
                    }
                    break;

                // 알 수 없는 메시지 타입 처리
                default:
                    console.warn(`알 수 없는 메시지 타입: ${message.action}`);
                    sendResponse({ 
                        success: false, 
                        error: "알 수 없는 메시지 타입" 
                    });
            }
        } catch (error) {
            console.error(`메시지 처리 중 오류 (${message.action}):`, error);
            sendResponse({ 
                success: false, 
                error: error.message 
            });
        }
    }
}

// --- 초기화 ---
// 즉시 실행 비동기 함수 (IIAFE) 사용
(async () => {
    const emoticonManager = new EmoticonManager();
    await emoticonManager.initialize(); // EmoticonManager 초기화 (스토리지 로드)
    const messageHandler = new MessageHandler(emoticonManager);
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        messageHandler.handleMessage(message, sender, sendResponse);
        return true;
    });
    console.log("치지직 이모티콘 도우미 content script 초기화 완료.");
})();