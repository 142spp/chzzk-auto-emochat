/**
 * content.js - 치지직 랜덤 이모티콘 도우미 (v8 - 함수형 리팩토링)
 * 기능:
 * - 설정된 최소/최대 횟수 범위 내 랜덤 횟수로 이모티콘 반복 입력
 * - 이미지 이모티콘 사용 (DOM 직접 조작 및 input 이벤트 발생)
 * - Main World 변수(__workingChat, __workingEmoticon) 업데이트 시도
 * - 자동 입력 (Background 제어), 랜덤 간격
 * - 토스트 메시지 표시
 */
console.log("치지직 이모티콘 도우미 content script 로드됨 (v8).");

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
    DEFAULT_SETTINGS: { // background.js와 동일하게 유지 (혹시 모를 상황 대비)
        minRepetitions: 1,
        maxRepetitions: 1,
        minDelay: 2000,
        maxDelay: 3000
    }
};

// --- 상태 관리 ---
let state = {
    cachedEmoticons: [], // 로드된 이모티콘 캐시
    settings: { ...CONSTANTS.DEFAULT_SETTINGS }, // 로드된 설정
    previousIndex: -1,
    previousRepetitions: 0,
    isSending: false // 중복 실행 방지 플래그
};

// --- 유틸리티 함수 ---

/**
 * 토스트 메시지를 표시합니다.
 * @param {string} message - 메시지 내용
 * @param {number} [duration=CONSTANTS.TOAST.DURATION] - 표시 시간 (ms)
 */
function showToast(message, duration = CONSTANTS.TOAST.DURATION) {
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

/**
 * HTML 문자열을 안전하게 처리합니다. (간단한 버전)
 * @param {string} str - 처리할 HTML 문자열
 * @returns {string} 안전하게 처리된 문자열 (img 태그만 허용)
 */
function sanitizeHTML(str) {
    const allowedTags = ['img'];
    const allowedAttributes = ['src', 'title', 'alt', 'style'];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = str;

    tempDiv.querySelectorAll('*').forEach(el => {
        if (!allowedTags.includes(el.tagName.toLowerCase())) {
            el.remove(); // 허용되지 않은 태그 제거
            return;
        }
        // 허용되지 않은 속성 제거
        Array.from(el.attributes).forEach(attr => {
            if (!allowedAttributes.includes(attr.name.toLowerCase())) {
                el.removeAttribute(attr.name);
            }
            // style 속성 추가 검증 (더 엄격하게 할 수 있음)
            if (attr.name.toLowerCase() === 'style' && !/^(vertical-align:\s*middle;?\s*height:\s*20px;?\s*margin:\s*0\s*1px;?)?$/.test(attr.value)) {
                 el.removeAttribute('style');
            }
             // src 속성 URL 검증 (https로 시작하는지)
            if (attr.name.toLowerCase() === 'src' && !attr.value.startsWith('https://')) {
                el.removeAttribute('src');
            }
        });
    });
    return tempDiv.innerHTML;
}

// --- Main World 통신 ---

/**
 * Main World의 변수 값을 가져옵니다.
 * @param {string} variableName - 변수 이름
 * @returns {Promise<any>}
 */
async function getMainWorldVariable(variableName) {
    try {
        // background script에게 요청하여 main world 변수 접근
        return await chrome.runtime.sendMessage({ type: "getVariable", value: variableName });
    } catch (error) {
        // Background script와 통신 불가 또는 executeScript 실패
        console.warn(`Main World 변수 가져오기 실패 (${variableName}):`, error.message);
        if (error.message.includes("Could not establish connection")) {
            console.warn("백그라운드 스크립트 연결 실패. 확장이 업데이트되었거나 비활성화되었을 수 있습니다.");
        }
        return undefined;
    }
}

/**
 * Main World의 변수 값을 설정합니다.
 * @param {string} variableName - 변수 이름
 * @param {any} value - 설정할 값
 * @returns {Promise<boolean>} 성공 여부
 */
async function setMainWorldVariable(variableName, value) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: "setVariable",
            value: { name: variableName, value: value }
        });
        // 응답 구조 확인 (background.js의 handleSetVariable 반환값)
        if (response && response.success) {
            return true;
        }
        console.warn(`Main World 변수 설정 응답 실패 (${variableName}):`, response);
        return false;
    } catch (error) {
        console.warn(`Main World 변수 설정 실패 (${variableName}):`, error.message);
        if (error.message.includes("Could not establish connection")) {
            console.warn("백그라운드 스크립트 연결 실패.");
        }
        return false;
    }
}

// --- 이모티콘 관리 ---

/**
 * 스토리지에서 이모티콘 캐시를 로드하여 상태(state.cachedEmoticons)에 저장합니다.
 * @returns {Promise<void>}
 */
async function loadEmoticonCache() {
    try {
        const result = await chrome.storage.local.get([CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]);
        state.cachedEmoticons = result[CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE] || [];
        console.log(`이모티콘 캐시 로드 완료: ${state.cachedEmoticons.length}개`);
    } catch (error) {
        console.error('이모티콘 캐시 로드 중 오류:', error);
        showToast('이모티콘 캐시 로드 오류');
        state.cachedEmoticons = []; // 오류 시 빈 배열로 초기화
    }
}

/**
 * 스토리지에서 설정을 로드하여 상태(state.settings)에 저장합니다.
 * @returns {Promise<void>}
 */
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get([CONSTANTS.STORAGE_KEYS.SETTINGS]);
        state.settings = { ...CONSTANTS.DEFAULT_SETTINGS, ...result[CONSTANTS.STORAGE_KEYS.SETTINGS] };
         console.log('설정 로드 완료:', state.settings);
    } catch (error) {
        console.error('설정 로드 중 오류:', error);
        showToast('설정 로드 오류');
        // 기본 설정 사용
        state.settings = { ...CONSTANTS.DEFAULT_SETTINGS };
    }
}

/**
 * 사용 가능한 (선택된) 이모티콘 목록을 반환합니다.
 * 선택된 것이 없으면 전체 목록을 반환합니다.
 * @returns {Array} 사용 가능한 이모티콘 객체 배열
 */
function getAvailableEmoticons() {
    const selectedEmoticons = state.cachedEmoticons.filter(emoticon => emoticon.selected);
    if (selectedEmoticons.length > 0) {
        return selectedEmoticons;
    }
    // 선택된 이모티콘이 하나도 없으면, 캐시된 모든 이모티콘을 사용 가능하게 함
    if (state.cachedEmoticons.length > 0) {
        console.warn("선택된 이모티콘이 없어 전체 캐시 목록을 사용합니다.");
        return [...state.cachedEmoticons];
    }
    // 캐시 자체가 비어있는 경우 (오류 또는 초기 상태)
    return [];
}

/**
 * 랜덤 이모티콘 전송을 위한 데이터를 준비합니다.
 * @returns {Promise<{success: boolean, data?: {editableArea: Element, newHtmlString: string, newWorkingChat: string, newEmoticonMap: Object}, error?: string}>}
 */
async function prepareEmoticonData() {
    const MAX_RETRIES = 5; // 동일 이모티콘/횟수 재시도 최대 횟수
    try {
        // 현재 설정 사용 (상태에 저장된 값)
        const availableEmoticons = getAvailableEmoticons();

        if (availableEmoticons.length === 0) {
            return { success: false, error: "사용 가능한 이모티콘이 없습니다. 팝업에서 이모티콘을 추가하거나 선택해주세요." };
        }

        const { minRepetitions: minReps, maxRepetitions: maxReps } = state.settings;

        // 반복 횟수 및 이모티콘 랜덤 선택 (이전 값과 다른 값 선호)
        let retryCount = 0, actualRepetitions, randomIndex;
        do {
            actualRepetitions = Math.floor(Math.random() * (maxReps - minReps + 1)) + minReps;
            randomIndex = Math.floor(Math.random() * availableEmoticons.length);
            if (actualRepetitions === state.previousRepetitions && randomIndex === state.previousIndex && availableEmoticons.length > 1) {
                retryCount++;
            } else {
                break;
            }
        } while (retryCount < MAX_RETRIES);

        if (retryCount === MAX_RETRIES) {
            console.warn(`최대 재시도 (${MAX_RETRIES}회) 초과. 이전과 동일한 이모티콘/반복으로 진행합니다.`);
        }
        state.previousRepetitions = actualRepetitions;
        state.previousIndex = randomIndex;

        const chosenEmoticon = availableEmoticons[randomIndex];
        const { name, url } = chosenEmoticon;
        const placeholder = `{:${name}:}`;

        // 채팅 입력 영역 찾기
        const chatInputContainer = document.querySelector(CONSTANTS.SELECTORS.INPUT_CONTAINER);
        const editableArea = chatInputContainer?.querySelector(CONSTANTS.SELECTORS.CHAT_INPUT);

        if (!editableArea) {
            return { success: false, error: "채팅 입력 영역을 찾을 수 없습니다." };
        }

        // Main World 변수 읽기 시도
        const currentChatVar = await getMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT) ?? "";
        const currentEmoticonMap = await getMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_EMOTICON) ?? {};

        // HTML 생성 및 안전 처리
        const rawEmoticonHtml = `<img src="${url}" title="${placeholder}" alt="${placeholder}" style="vertical-align: middle; height: 20px; margin: 0 1px;">`;
        const sanitizedEmoticonHtml = sanitizeHTML(rawEmoticonHtml); // 기본적인 HTML 필터링

        if (!sanitizedEmoticonHtml.includes('<img')) { // Sanitize 과정에서 img 태그가 제거되었다면 문제 발생
            console.error("Sanitize 과정에서 이미지 태그 생성 실패:", { name, url });
            return { success: false, error: "이모티콘 이미지 생성 중 오류가 발생했습니다." };
        }

        const newHtmlString = currentChatVar + sanitizedEmoticonHtml.repeat(actualRepetitions);
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
        console.error("이모티콘 데이터 준비 중 예상치 못한 오류 발생:", error);
        return {
            success: false,
            error: `이모티콘 준비 중 오류: ${error.message}`
        };
    }
}

/**
 * 준비된 데이터로 채팅창에 이모티콘을 입력하고 전송 이벤트를 발생시킵니다.
 * @param {object} preparedData - prepareEmoticonData의 반환 데이터
 * @param {boolean} isAuto - 자동 전송 여부
 * @returns {Promise<boolean>} 성공 여부
 */
async function sendPreparedEmoticons(preparedData, isAuto) {
    if (state.isSending) {
        console.warn("이미 이모티콘 전송이 진행 중입니다. 중복 실행 방지됨.");
        return false;
    }
    state.isSending = true;

    try {
        const { editableArea, newHtmlString, newWorkingChat, newEmoticonMap } = preparedData;

        // 1. 포커스 및 내용 삽입 (innerHTML 사용)
        editableArea.focus();
        editableArea.innerHTML = newHtmlString; // innerHTML 사용, 앞서 sanitize됨

        // 2. Input 이벤트 발생 (React/Vue 등 프레임워크에 변경 알림)
        editableArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

        // 3. Main World 변수 업데이트 시도
        //    undefined이면 변수가 없다고 판단하고 업데이트 생략
        if (typeof await getMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT) !== 'undefined') {
            await setMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT, newWorkingChat);
            await setMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_EMOTICON, newEmoticonMap);
        }

        // 4. 자동 전송 시 짧은 딜레이 (선택 사항)
        if (isAuto) {
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.AUTO_SEND_DELAY));
        }

        // 5. Enter 키 이벤트 발생 (전송 트리거)
        //    약간의 딜레이 후 이벤트 발생
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

        // 6. 입력창 비우기
        editableArea.innerHTML = "";
        editableArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        if (typeof await getMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT) !== 'undefined') {
            await setMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_CHAT, "");
            // emoticonMap은 초기화하지 않아도 될 수 있음 (치지직 내부 로직 따라)
            // await setMainWorldVariable(CONSTANTS.MAIN_WORLD_VARS.WORKING_EMOTICON, {});
        }

        console.log("이모티콘 입력 및 전송 이벤트 발생 성공");
        return true;

    } catch (error) {
        console.error("이모티콘 입력/전송 중 오류 발생:", error);
        showToast(`이모티콘 전송 오류: ${error.message}`);
        // 오류 발생 시 입력창을 안전하게 비우는 시도
        try {
            const el = document.querySelector(CONSTANTS.SELECTORS.CHAT_INPUT);
            if (el) el.innerHTML = '';
        } catch (clearError) {
             console.error("오류 후 입력창 비우기 실패:", clearError);
        }
        return false;
    } finally {
        state.isSending = false; // 플래그 해제
    }
}

/**
 * 랜덤 이모티콘 전송 절차를 실행합니다.
 * @param {boolean} isAuto - 자동 전송 여부
 * @returns {Promise<boolean>} 전송 성공 여부
 */
async function triggerRandomEmoticonSend(isAuto = false) {
    const preparationResult = await prepareEmoticonData();
    if (!preparationResult.success) {
        showToast(preparationResult.error || "이모티콘 준비 중 오류 발생", true);
        return false;
    }

    return await sendPreparedEmoticons(preparationResult.data, isAuto);
}

/**
 * 컨텍스트 메뉴를 통해 전달된 이모티콘 데이터를 캐시에 추가합니다.
 * @param {object} emoticonData - 추가할 이모티콘 데이터 ({ url: string, name: string })
 * @returns {Promise<void>}
 */
async function handleAddEmoticonFromContextMenu(emoticonData) {
    try {
        // 데이터 유효성 검사
        if (!emoticonData || typeof emoticonData.url !== 'string' || !emoticonData.url.startsWith('https://') || typeof emoticonData.name !== 'string' || !emoticonData.name) {
            throw new Error("잘못된 이모티콘 데이터 형식입니다.");
        }

        // 중복 체크 (이름과 URL 모두 비교)
        const isDuplicate = state.cachedEmoticons.some(item =>
            item.name === emoticonData.name &&
            item.url === emoticonData.url
        );

        if (isDuplicate) {
            showToast('이미 추가된 이모티콘입니다.');
            return; // 중복이면 추가하지 않음
        }

        // 새 이모티콘 객체 생성 (기본적으로 선택됨으로 추가)
        const newEmoticon = { ...emoticonData, selected: true };

        // 상태 업데이트
        state.cachedEmoticons.push(newEmoticon);

        // 스토리지 업데이트
        await chrome.storage.local.set({
            [CONSTANTS.STORAGE_KEYS.EMOTICON_CACHE]: state.cachedEmoticons
        });

        console.log("컨텍스트 메뉴 통해 이모티콘 추가 성공:", newEmoticon);
        showToast('이모티콘이 추가되었습니다.');

    } catch (error) {
        console.error("컨텍스트 메뉴 이모티콘 추가 중 오류:", error);
        showToast(`이모티콘 추가 오류: ${error.message}`);
    }
}

// --- 메시지 핸들러 ---

/**
 * Background 및 Popupからの 메시지를 처리합니다.
 * @param {Object} message - 메시지 객체
 * @param {Object} sender - 송신자 정보
 * @param {Function} sendResponse - 응답 함수
 */
async function handleMessage(message, sender, sendResponse) {
    console.log(`[Content] 메시지 수신: ${message.action}`, message);

    try {
        switch (message.action) {
            case "showToast":
                showToast(message.message);
                sendResponse({ success: true });
                break;

            case "injectAndSendTrigger":
                console.log(`이모티콘 전송 요청 받음 (자동: ${message.isAuto})`);
                sendResponse({ success : true});
                await triggerRandomEmoticonSend(message.isAuto);
                break;

            case "addEmoticonToCache": // Context Menu (background -> content)
                await handleAddEmoticonFromContextMenu(message.emoticonData);
                sendResponse({ success: true });
                break;

            case "emoticonCacheUpdated": // Popup 알림
                console.log("팝업에서 캐시 업데이트 알림 수신 - 캐시 다시 로드");
                await loadEmoticonCache();
                sendResponse({ success: true });
                break;

            default:
                console.warn(`[Content] 알 수 없는 메시지 타입: ${message.action}`);
                sendResponse({ success: false, error: "알 수 없는 메시지 타입" });
        }
    } catch (error) {
        console.error(`[Content] 메시지 처리 중 오류 (${message.action}):`, error);
        // 오류 발생 시에도 실패 응답을 보냅니다.
        sendResponse({ success: false, error: error.message });
    }

    // 비동기 응답을 위해 true 반환해야 함
    return true;
}

// --- 초기화 ---

/**
 * Content script 초기화 함수
 */
async function initializeContentScript() {
    await loadSettings(); // 설정 먼저 로드
    await loadEmoticonCache(); // 이모티콘 캐시 로드

    // 메시지 리스너 등록
    chrome.runtime.onMessage.addListener(handleMessage);

    console.log("치지직 이모티콘 도우미 content script 초기화 완료.");
}

// 초기화 실행
initializeContentScript();