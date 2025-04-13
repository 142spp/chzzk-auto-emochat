/**
 * content.js - 치지직 랜덤 이모티콘 도우미 (v6 - DOM 조작 강화)
 * 기능:
 * - 설정된 최소/최대 횟수 범위 내 랜덤 횟수로 이모티콘 반복 입력
 * - 이미지 이모티콘 사용 (DOM 직접 조작 및 input 이벤트 발생)
 * - Main World 변수(__workingChat, __workingEmoticon) 업데이트 시도
 * - 자동 입력 (Background 제어), 랜덤 간격
 * - 토스트 메시지 표시
 */
console.log("치지직 이모티콘 도우미 content script 로드됨 (v6).");

let cachedEmoticonData = null; // 이모티콘 데이터 캐시 변수

// --- 상수 정의 ---
const CONSTANTS = {
    CHAT_INPUT_SELECTOR: "pre.live_chatting_input_input__2F3Et[contenteditable='true']",
    SEND_BUTTON_SELECTOR: "button.live_chatting_input_send_button__8KBrn#send_chat_or_donate",
    EMOTICON_BUTTON_SELECTOR: "button.emoticon_emoticon__q2Sw6",
    INPUT_CONTAINER_SELECTOR: ".live_chatting_input_container__qA0ad",
    TOAST_DURATION: 2500,
    AUTO_SEND_DELAY: 150
};

// --- Helper Functions ---

/**
 * 사용 가능한 이모티콘 데이터를 가져옵니다.
 * @returns {Promise<Object>} 이모티콘 데이터
 */
async function getAvailableEmoticonData() {
    try {
        // 먼저 캐시에서 데이터 확인
        const cacheResponse = await chrome.runtime.sendMessage({ action: "getEmoticonCache" });
        if (cacheResponse?.success && cacheResponse.cache) {
            console.log('캐시된 이모티콘 데이터 사용');
            return cacheResponse.cache;
        }

        // 캐시가 없거나 만료된 경우 새로 가져오기
        console.log('이모티콘 데이터 새로 가져오기');
        const emoticonData = await prepareEmoticonData();
        
        // 새로 가져온 데이터를 캐시에 저장
        await chrome.runtime.sendMessage({ 
            action: "updateEmoticonCache", 
            data: emoticonData 
        });

        return emoticonData;
    } catch (error) {
        console.error('이모티콘 데이터 가져오기 실패:', error);
        throw error;
    }
}

/**
 * 화면 하단 중앙에 토스트 메시지를 표시합니다.
 * @param {string} message - 표시할 메시지 내용
 * @param {number} [duration=2500] - 메시지 표시 시간 (ms)
 */
function showToast(message, duration = CONSTANTS.TOAST_DURATION) {
    const existingToast = document.getElementById('chzzkMacroToast');
    if (existingToast) {
        existingToast.remove(); // 이전 토스트 제거
    }

    const toast = document.createElement('div');
    toast.id = 'chzzkMacroToast';
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
        }, 300); // transition 시간 후 제거
    }, duration);
}

/**
 * Main World의 window 객체 변수 값을 가져옵니다. (Background Script 통신 필요)
 * @param {string} variableName - 가져올 변수 이름 (e.g., '__workingChat')
 * @returns {Promise<any|undefined>} 변수 값 또는 오류 시 undefined
 */
async function getMainWorldVariable(variableName) {
    try {
        // Background에 'getVariable' 메시지 전송
        return await chrome.runtime.sendMessage({ type: "getVariable", value: variableName });
    } catch (error) {
        console.error(`Error getting main world variable ${variableName}:`, error);
        return undefined;
    }
}

/**
 * Main World의 window 객체 변수 값을 설정합니다. (Background Script 통신 필요)
 * @param {string} variableName - 설정할 변수 이름
 * @param {any} value - 설정할 값
 * @returns {Promise<boolean>} 성공 시 true, 실패 시 false
 */
async function setMainWorldVariable(variableName, value) {
     try {
        // Background에 'setVariable' 메시지 전송
        const response = await chrome.runtime.sendMessage({ type: "setVariable", value: { name: variableName, value: value } });
        return response && response.success;
    } catch (error) {
        console.error(`Error setting main world variable ${variableName}:`, error);
        return false;
    }
}

/**
 * 이모티콘 데이터를 준비하고 전송할 HTML과 워킹 데이터를 생성합니다.
 * @returns {Promise<{success: boolean, data?: {editableArea: Element, newHtmlString: string, newWorkingChat: string, newEmoticonMap: Object}, error?: string}>}
 */
async function prepareEmoticonData() {
    try {
        const settings = await chrome.storage.sync.get(['minRepetitions', 'maxRepetitions']);
        const availableEmoticons = await getAvailableEmoticonData();

        const minReps = Math.max(1, settings.minRepetitions || 1);
        const maxReps = Math.max(minReps, settings.maxRepetitions || 1);
        const actualRepetitions = Math.floor(Math.random() * (maxReps - minReps + 1)) + minReps;

        const randomIndex = Math.floor(Math.random() * availableEmoticons.length);
        const chosenEmoticon = availableEmoticons[randomIndex];
        const { placeholder, imageUrl } = chosenEmoticon;
        const emojiKey = placeholder.replace(/[{}:]/g, "");

        const chatInputContainer = document.querySelector(CONSTANTS.INPUT_CONTAINER_SELECTOR);
        const editableArea = chatInputContainer?.querySelector(CONSTANTS.CHAT_INPUT_SELECTOR);

        if (!editableArea) {
            throw new Error("채팅 입력 영역을 찾을 수 없습니다.");
        }

        const currentChatVar = await getMainWorldVariable('__workingChat') ?? "";
        const currentEmoticonMap = await getMainWorldVariable('__workingEmoticon') ?? {};

        let newHtmlString = currentChatVar;
        let newWorkingChat = currentChatVar;
        const newEmoticonMap = { ...currentEmoticonMap };

        // DOM 조작 최적화를 위해 한 번에 HTML 생성
        const emoticonHtml = `<img src="${imageUrl}" title="${placeholder}" alt="${placeholder}" style="vertical-align: middle; height: 20px; margin: 0 1px;">`;
        newHtmlString += emoticonHtml.repeat(actualRepetitions);
        newWorkingChat += placeholder.repeat(actualRepetitions);

        if (!newEmoticonMap[emojiKey]) {
            newEmoticonMap[emojiKey] = imageUrl;
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
async function sendEmoticon(isAuto = false) {
    try {
        const prepared = await prepareEmoticonData();
        if (!prepared.success) return false;

        const { editableArea, newHtmlString, newWorkingChat, newEmoticonMap } = prepared.data;

        // DOM 업데이트
        editableArea.focus();
        editableArea.innerHTML = newHtmlString;
        editableArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

        // Main World 변수 업데이트
        if (typeof await getMainWorldVariable('__workingChat') !== 'undefined') {
            await setMainWorldVariable('__workingChat', newWorkingChat);
            await setMainWorldVariable('__workingEmoticon', newEmoticonMap);
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
        if (typeof await getMainWorldVariable('__workingChat') !== 'undefined') {
            await setMainWorldVariable('__workingChat', "");
            await setMainWorldVariable('__workingEmoticon', {});
        }

        return true;

    } catch (error) {
        console.error(`${isAuto ? '자동' : '수동'} 전송 중 오류:`, error.message);
        showToast(`전송 실패: ${error.message}`, CONSTANTS.TOAST_DURATION);
        return false;
    }
}

// 메시지 리스너 수정
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background로부터 메시지 수신:", request.action);
    switch (request.action) {
        case "injectAndSendTrigger":
            sendEmoticon(request.isAuto)  // isAuto 값을 전달받아 사용
                .then(success => sendResponse({ success }))
                .catch(error => {
                    console.error("메시지 처리 중 오류:", error);
                    sendResponse({ success: false, error: error.message })
                });
            return true;
        case "showToast":
            showToast(request.message);
            sendResponse({ success: true });
            break;
    }
});

// --- 페이지 로드 시 초기화 (더 이상 필요 없음) ---
console.log("치지직 이모티콘 도우미 content script 초기화 완료.");