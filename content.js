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
        SEND_BUTTON: "button.live_chatting_input_send_button__8KBrn#send_chat_or_donate",
        EMOTICON_BUTTON: "button.emoticon_emoticon__q2Sw6",
        INPUT_CONTAINER: ".live_chatting_input_container__qA0ad"
    },
    STORAGE_KEYS: {
        EMOTICON_CACHE: 'emoticonCache',
        SELECTED_EMOTICONS: 'selectedEmoticons'
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
        this.cachedEmoticons = CONSTANTS.DEFAULT_EMOTICONS; // 기본값으로 초기화
        this.selectedIndices = []; // 선택된 이모티콘 인덱스 배열
    }
    /**
     * 스토리지에서 이모티콘 캐시를 비동기적으로 로드하여 초기화합니다.
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            const result = await chrome.storage.local.get([
                CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE,
                CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS
            ]);
            
            // 이모티콘 캐시 로드
            if (result && Array.isArray(result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE])) {
                this.cachedEmoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE];
                console.log("저장된 이모티콘 캐시 로드 완료.");
            } else {
                console.log("저장된 이모티콘 캐시 없음 또는 형식이 잘못됨. 기본 이모티콘 사용.");
            }
            
            // 선택된 인덱스 로드
            if (result && Array.isArray(result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS])) {
                this.selectedIndices = result[CONSTANTS.STORAGE_KEYS.SELECTED_EMOTICONS];
                console.log(`선택된 이모티콘 인덱스 로드 완료. (${this.selectedIndices.length}개)`);
            } else {
                // 기본적으로 모든 이모티콘 선택 (처음 사용 시)
                this.selectedIndices = Array.from({ length: this.cachedEmoticons.length }, (_, i) => i);
                console.log("선택된 이모티콘 인덱스 없음. 모든 이모티콘을 선택 상태로 설정.");
            }
        } catch (error) {
            console.error('캐시 데이터를 가져오는 중 오류 발생:', error);
        }
    }
    
    /**
     * 로컬 스토리지의 이모티콘 캐시를 현재 캐시된 데이터로 업데이트합니다.
     * @returns {Promise<void>}
    */
    async updateEmoticon() {
        try {
            await chrome.storage.local.set({
                [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: this.cachedEmoticons
            });
        } catch (error) {
            console.error('캐시 데이터를 업데이트하는 중 오류 발생:', error);
        }
    }
    
    /**
     * 사용 가능한 이모티콘 목록을 반환합니다.
     * 선택된 이모티콘이 있으면 선택된 것만 반환하고, 없으면 모든 이모티콘을 반환합니다.
     * @returns {Array} 사용 가능한 이모티콘 배열
     */
    getAvailableEmoticons() {
        // 선택된 인덱스가 없거나 비어있으면 모든 이모티콘 반환
        if (!this.selectedIndices || this.selectedIndices.length === 0) {
            console.log("선택된 이모티콘 없음. 모든 이모티콘 사용.");
            return [...this.cachedEmoticons];
        }
        
        // 선택된 인덱스에 해당하는 이모티콘만 필터링하여 반환
        const selectedEmoticons = this.selectedIndices
            .filter(index => index >= 0 && index < this.cachedEmoticons.length)
            .map(index => this.cachedEmoticons[index]);
            
        console.log(`선택된 이모티콘 ${selectedEmoticons.length}개 사용.`);
        
        // 선택된 이모티콘이 없다면 모든 이모티콘 반환 (안전장치)
        return selectedEmoticons.length > 0 ? selectedEmoticons : [...this.cachedEmoticons];
    }
    
    /**
     * 이모티콘 데이터를 준비합니다.
     * @returns {Promise<{success: boolean, data?: {editableArea: Element, newHtmlString: string, newWorkingChat: string, newEmoticonMap: Object}, error?: string}>}
    */
    async prepareEmoticon() {
        try {
            const settings = await chrome.storage.sync.get(['minRepetitions', 'maxRepetitions']);
            const availableEmoticons = this.getAvailableEmoticons();

            if (availableEmoticons.length === 0) {
                throw new Error("사용 가능한 이모티콘이 없습니다.");
            }

            const minReps = Math.max(1, settings.minRepetitions || 1);
            const maxReps = Math.max(minReps, settings.maxRepetitions || 1);
            const actualRepetitions = Math.floor(Math.random() * (maxReps - minReps + 1)) + minReps;

            const randomIndex = Math.floor(Math.random() * availableEmoticons.length);
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
    async sendEmoticon(isAuto = false) {
        try {
            const prepared = await this.prepareEmoticon();
            if (!prepared.success) return false;

            const { editableArea, newHtmlString, newWorkingChat, newEmoticonMap } = prepared.data;

            // DOM 업데이트
            editableArea.focus();
            editableArea.innerHTML = newHtmlString;
            editableArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

            // Main World 변수 업데이트
            if (typeof await MainWorldManager.getVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT) !== 'undefined') {
                await MainWorldManager.setVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT, newWorkingChat);
                await MainWorldManager.setVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_EMOTICON, newEmoticonMap);
            }

            // 자동 전송일 경우에만 딜레이 추가
            if (isAuto) {
                await new Promise(resolve => setTimeout(resolve, CONSTANTS.AUTO_SEND_DELAY));
            }

            // Enter 키 이벤트 발생
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

            // 초기화
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
    async addEmoticon(emoticonData) {
        try {
            // 중복 체크
            const isDuplicate = this.cachedEmoticons.some(item =>
                item.name === emoticonData.name &&
                item.url === emoticonData.url
            );

            if (!isDuplicate) {
                this.cachedEmoticons.push(emoticonData);
                await this.updateEmoticon();
                console.log('이모티콘이 캐시에 추가되었습니다.');
            } else {
                console.log('이미 캐시에 존재하는 이모티콘입니다.');
            }
        } catch (error) {
            console.error('이모티콘 캐시 추가 중 오류 발생:', error);
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
            await this.addEmoticon(emoticonData);
            UIManager.showToast('이모티콘이 캐시에 추가되었습니다.');
        } catch (error) {
            console.error('이모티콘 추가 중 오류 발생:', error);
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
        console.log("Content script 메시지 수신:", message);

        try {
            switch (message.action) {
                case "showToast":
                    UIManager.showToast(message.message);
                    sendResponse({ success: true });
                    break;

                case "injectAndSendTrigger":
                    const success = await this.emoticonManager.sendEmoticon(message.isAuto);
                    sendResponse({ success });
                    break;

                case "getEmoticons":
                    const emoticons = this.emoticonManager.cachedEmoticons;
                    sendResponse({ 
                        emoticons,
                        selectedIndices: this.emoticonManager.selectedIndices 
                    });
                    break;

                case "addEmoticonToCache":
                    await this.emoticonManager.handleContextMenuAdd(message.emoticonData);
                    sendResponse({ success: true });
                    break;

                case "emoticonCacheUpdated": // 캐시 업데이트 알림 수신
                    console.log("이모티콘 캐시 업데이트 알림 수신. 캐시를 다시 로드합니다.");
                    await this.emoticonManager.initialize(); // 캐시 다시 로드
                    sendResponse({ success: true });
                    break;
                    
                case "updateSelectedEmoticons": // 선택된 이모티콘 인덱스 업데이트
                    if (Array.isArray(message.selectedIndices)) {
                        this.emoticonManager.selectedIndices = message.selectedIndices;
                        console.log(`선택된 이모티콘 인덱스 업데이트됨 (${message.selectedIndices.length}개)`);
                        sendResponse({ success: true });
                    } else {
                        console.error("올바르지 않은 selectedIndices 형식");
                        sendResponse({ success: false, error: "올바르지 않은 selectedIndices 형식" });
                    }
                    break;

                default:
                    console.warn("알 수 없는 메시지 타입:", message.action);
                    sendResponse({ success: false, error: "알 수 없는 메시지 타입" });
            }
        } catch (error) {
            console.error("메시지 처리 중 오류 발생:", error);
            sendResponse({ success: false, error: error.message });
        }
    }
}

// --- 초기화 ---
// 즉시 실행 비동기 함수 (IIAFE) 사용
(async () => {
    const emoticonManager = new EmoticonManager();
    await emoticonManager.initialize(); // EmoticonManager 초기화 (스토리지 로드)

    const messageHandler = new MessageHandler(emoticonManager);

    // 메시지 리스너 등록
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // messageHandler.handleMessage가 비동기 함수이므로 await 필요 없음 (내부에서 처리)
        messageHandler.handleMessage(message, sender, sendResponse);
        return true; // 비동기 응답을 위해 true 반환
    });

    // --- 페이지 로드 시 초기화 (더 이상 필요 없음) ---
    console.log("치지직 이모티콘 도우미 content script 초기화 완료.");
})();