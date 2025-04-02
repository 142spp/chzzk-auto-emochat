/**
 * content.js - 치지직 랜덤 이모티콘 도우미 (v6 - DOM 조작 강화)
 * 기능:
 * - 설정된 최소/최대 횟수 범위 내 랜덤 횟수로 이모티콘 반복 입력
 * - 이미지 이모티콘 사용 (DOM 직접 조작 및 input 이벤트 발생)
 * - Main World 변수(__workingChat, __workingEmoticon) 업데이트 시도
 * - 자동 입력 (Background 제어), 랜덤 간격
 * - 도배 방지 (연속 3회 전송 후 다른 채팅 없으면 일시정지)
 * - 토스트 메시지 표시
 */
console.log("치지직 이모티콘 도우미 content script 로드됨 (v6).");

let cachedEmoticonData = null; // 이모티콘 데이터 캐시 변수

// --- 선택자 ---
const CHAT_INPUT_SELECTOR = "pre.live_chatting_input_input__2F3Et[contenteditable='true']";
const SEND_BUTTON_SELECTOR = "button.live_chatting_input_send_button__8KBrn#send_chat_or_donate";
const EMOTICON_BUTTON_SELECTOR = "button.emoticon_emoticon__q2Sw6"; // 이모티콘 선택 버튼
const INPUT_CONTAINER_SELECTOR = ".live_chatting_input_container__qA0ad"; // 입력 영역 컨테이너 (실제 클래스 확인!)
const CHAT_LIST_WRAPPER_SELECTOR = ".live_chatting_list_wrapper__a5XTV"; // 채팅 목록 감시 대상
const CHAT_ITEM_SELECTOR = ".live_chatting_list_item__0SGhw"; // 개별 채팅 메시지 아이템
const NICKNAME_SELECTOR = ".live_chatting_message_nickname__UdLXa .name_text__yQG50"; // 닉네임 텍스트 요소

// --- 도배 방지 관련 변수 ---
let consecutiveSends = 0; // 연속 전송 횟수
const SPAM_GUARD_THRESHOLD = 3; // 연속 전송 제한 횟수
let isSpamGuardPaused = false; // content script 내의 일시정지 상태
let chatObserver = null; // MutationObserver 인스턴스
let lastChatMessageNickname = null; // 마지막으로 감지된 채팅 메시지의 닉네임 저장

// --- Helper Functions ---

/**
 * 페이지에서 사용 가능한 이미지 이모티콘 데이터 (플레이스홀더, URL) 목록을 가져옵니다.
 * 캐시된 데이터가 있으면 사용하고, 없으면 새로 가져와 캐시합니다.
 * @returns {Array<{placeholder: string, imageUrl: string}>} 이모티콘 데이터 배열
 */
function getAvailableEmoticonData() {
    // 1. 캐시 확인
    if (cachedEmoticonData && cachedEmoticonData.length > 0) {
        console.log("캐시된 이모티콘 데이터 사용.");
        return cachedEmoticonData;
    }

    // 2. 캐시 없으면 새로 가져오기
    console.log("새 이모티콘 데이터 가져오는 중...");
    const emoticonButtons = document.querySelectorAll(EMOTICON_BUTTON_SELECTOR);
    const data = [];
    emoticonButtons.forEach(button => {
        const img = button.querySelector('img');
        const placeholder = img?.getAttribute('alt'); // 예: {:d_47:}
        const imageUrl = img?.getAttribute('src');
        // placeholder 형식 ({:key:}) 확인 및 URL 존재 여부 확인
        if (placeholder && /^\{:.+:\}$/.test(placeholder) && imageUrl) {
            data.push({ placeholder: placeholder, imageUrl: imageUrl });
        }
    });

    // 3. 데이터가 있을 경우에만 캐시
    if (data.length > 0) {
        cachedEmoticonData = data; // 가져온 데이터를 캐시에 저장
        console.log(`새 이모티콘 데이터 ${data.length}개 캐시됨.`);
    } else {
         console.warn("이모티콘 데이터를 찾을 수 없어 캐시하지 않음. 이모티콘 팝업이 로드되지 않았거나 선택자가 변경되었을 수 있습니다.");
    }

    return data; // 가져온 데이터 반환
}

/**
 * 화면 하단 중앙에 토스트 메시지를 표시합니다.
 * @param {string} message - 표시할 메시지 내용
 * @param {number} [duration=2500] - 메시지 표시 시간 (ms)
 */
function showToast(message, duration = 2500) {
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
 * @returns {Promise<{success: boolean, data: {editableArea: Element, newHtmlString: string, newWorkingChat: string, newEmoticonMap: Object}}>}
 */
async function prepareEmoticonData() {
    // 1. 설정 및 이모티콘 데이터 가져오기
    const settings = await chrome.storage.sync.get(['minRepetitions', 'maxRepetitions']);
    const availableEmoticons = getAvailableEmoticonData();

    if (availableEmoticons.length === 0) {
        showToast("사용 가능한 이모티콘이 없습니다. 팝업을 한 번 열어보세요.", 3000);
        return { success: false };
    }

    // 2. 반복 횟수 계산
    const minReps = settings.minRepetitions || 1;
    let maxReps = settings.maxRepetitions || 1;
    if (minReps > maxReps) maxReps = minReps;
    const actualRepetitions = Math.floor(Math.random() * (maxReps - minReps + 1)) + minReps;
    console.log(`반복 횟수: ${actualRepetitions} (범위: ${minReps}~${maxReps})`);

    // 3. 랜덤 이모티콘 선택
    const randomIndex = Math.floor(Math.random() * availableEmoticons.length);
    const chosenEmoticon = availableEmoticons[randomIndex];
    const placeholder = chosenEmoticon.placeholder;
    const imageUrl = chosenEmoticon.imageUrl;
    const emojiKey = placeholder.replace(/[{}:]/g, "");

    console.log(`선택된 이모티콘: ${placeholder}`);

    // 4. 채팅 입력 영역 찾기
    const chatInputContainer = document.querySelector(INPUT_CONTAINER_SELECTOR);
    const editableArea = chatInputContainer?.querySelector(CHAT_INPUT_SELECTOR);
    if (!editableArea) {
        console.error("채팅 입력 영역을 찾을 수 없습니다.");
        return { success: false };
    }

    // 5. 현재 상태 가져오기
    const currentChatVar = await getMainWorldVariable('__workingChat') ?? "";
    const currentEmoticonMap = await getMainWorldVariable('__workingEmoticon') ?? {};
    
    // 6. 새 채팅 데이터 생성
    let newHtmlString = currentChatVar;
    let newWorkingChat = currentChatVar;
    const newEmoticonMap = { ...currentEmoticonMap };

    for (let i = 0; i < actualRepetitions; i++) {
        newHtmlString += `<img src="${imageUrl}" title="${placeholder}" alt="${placeholder}" style="vertical-align: middle; height: 20px; margin: 0 1px;">`;
        newWorkingChat += placeholder;
        if (!newEmoticonMap[emojiKey]) {
            newEmoticonMap[emojiKey] = imageUrl;
        }
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
}

/**
 * 이모티콘을 전송합니다.
 * @param {boolean} isAuto - 자동 전송 여부
 * @returns {Promise<boolean>} 전송 성공 여부
 */
async function sendEmoticon(isAuto = false) {
    // Observer 중지는 자동일 때만
    if (isAuto) {
        stopChatObserver(true);
    }
    
    let sendSuccess = false;

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
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        // 키보드 이벤트 시퀀스 발생
        const eventOptions = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
        };

        // keydown -> keypress -> keyup 순서로 이벤트 발생
        editableArea.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        editableArea.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        editableArea.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
        
        // 엔터 이벤트 후 딜레이 추가
        await new Promise(resolve => setTimeout(resolve, 200));
        
        sendSuccess = true;

        // 초기화 전 딜레이 추가
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 초기화
        editableArea.innerHTML = "";
        editableArea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        if (typeof await getMainWorldVariable('__workingChat') !== 'undefined') {
            await setMainWorldVariable('__workingChat', "");
            await setMainWorldVariable('__workingEmoticon', {});
        }

        // 자동 전송일 경우에만 도배 방지 카운터 업데이트
        if (isAuto && sendSuccess) {
            consecutiveSends++;
            console.log(`연속 전송 횟수 증가: ${consecutiveSends}`);
            if (consecutiveSends >= SPAM_GUARD_THRESHOLD && !isSpamGuardPaused) {
                isSpamGuardPaused = true;
                chrome.runtime.sendMessage({ action: "pauseAutoSend" })
                    .catch(e => console.error("일시정지 메시지 전송 실패:", e));
            }
        }

    } catch (error) {
        console.error(`${isAuto ? '자동' : '수동'} 전송 중 오류:`, error.message);
        showToast(`전송 실패: ${error.message}`, 3000);
        sendSuccess = false;
    } finally {
        // Observer 재시작도 자동일 때만
        if (isAuto) {
            startChatObserver(true);
        }
    }

    return sendSuccess;
}

// --- 채팅 감시 로직 ---

/**
 * 채팅 목록 감시를 시작하거나 재개합니다.
 * @param {boolean} [isResuming=false] - 임시 중지 후 재개하는 경우 true
 */
function startChatObserver(isResuming = false) {
    const chatListWrapper = document.querySelector(CHAT_LIST_WRAPPER_SELECTOR);
    if (!chatListWrapper) {
        console.error("채팅 목록 wrapper를 찾을 수 없어 감시자를 시작할 수 없습니다.");
        if (!isResuming) setTimeout(() => startChatObserver(false), 1000); // 1초 후 재시도
        return;
    }

    if (!chatObserver) {
        console.log("새 채팅 목록 감시자 생성 및 시작.");
        chatObserver = new MutationObserver(handleChatMutation);
    } else {
         console.log(`채팅 목록 감시 ${isResuming ? '재개' : '시작/재연결 시도'}.`);
    }

    try {
         chatObserver.observe(chatListWrapper, { childList: true, subtree: false }); // 직접 자식 노드 추가만 감시
    } catch (e) {
         if (e.name !== 'InvalidStateError') console.error("Observer 시작 오류:", e);
         else console.log("이미 관찰 중입니다.");
    }

    if (!isResuming) { // 새로 시작할 때만 초기화
        consecutiveSends = 0;
        isSpamGuardPaused = false;
        lastChatMessageNickname = null;
        const lastMessage = chatListWrapper.querySelector(`${CHAT_ITEM_SELECTOR}:last-child ${NICKNAME_SELECTOR}`);
        if(lastMessage) {
            lastChatMessageNickname = lastMessage.textContent?.trim();
            console.log("초기 마지막 메시지 닉네임:", lastChatMessageNickname);
        }
    }
}

/**
 * MutationObserver 콜백 함수: 채팅 목록 변경 감지 및 도배 방지 처리
 * @param {MutationRecord[]} mutationsList - 변경 사항 목록
 */
function handleChatMutation(mutationsList) {
    let newDifferentMessageDetected = false;
    let latestNicknameInBatch = null;

    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches(CHAT_ITEM_SELECTOR)) {
                    const nicknameElement = node.querySelector(NICKNAME_SELECTOR);
                    const currentNickname = nicknameElement?.textContent?.trim();
                    if (currentNickname) {
                        console.log(`새 메시지 감지: ${currentNickname}`);
                        latestNicknameInBatch = currentNickname;
                        // 이전에 저장된 닉네임과 다를 때만 다른 사용자 메시지로 간주
                        if (lastChatMessageNickname !== null && currentNickname !== lastChatMessageNickname) {
                            console.log(`다른 사용자(${currentNickname})의 메시지 감지. 이전: ${lastChatMessageNickname}`);
                            newDifferentMessageDetected = true;
                        }
                    } else {
                         console.log("닉네임 없는 채팅 아이템 추가됨.");
                         newDifferentMessageDetected = true; // 시스템 메시지도 초기화 트리거
                    }
                }
            });
        }
    }

    // 변경 배치 처리 후 마지막 닉네임 업데이트
    if (latestNicknameInBatch) {
        lastChatMessageNickname = latestNicknameInBatch;
    }

    // 다른 사용자의 메시지가 감지되었으면 카운터 초기화 및 재개 요청
    if (newDifferentMessageDetected) {
        console.log("다른 메시지 감지됨 -> 연속 전송 횟수 초기화.");
        consecutiveSends = 0;
        if (isSpamGuardPaused) { // Content Script의 상태 확인
            console.log("일시정지 상태 해제 요청.");
            isSpamGuardPaused = false; // 먼저 상태 변경
            chrome.runtime.sendMessage({ action: "resumeAutoSend" })
                .catch(e => console.error("재개 메시지 전송 실패:", e));
        }
    }
}

/**
 * 채팅 목록 감시를 중지합니다.
 * @param {boolean} [isTemporary=false] - true면 인스턴스를 유지하고 disconnect만 호출
 */
function stopChatObserver(isTemporary = false) {
    if (chatObserver) {
        console.log(`채팅 목록 감시 ${isTemporary ? '임시' : '완전'} 중지 (disconnect).`);
        chatObserver.disconnect();
        if (!isTemporary) {
            chatObserver = null; // 완전 중지 시 인스턴스 제거
        }
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
        case "startAutoSendObservation":
            startChatObserver();
            sendResponse({ success: true });
            break;
        case "stopAutoSendObservation":
            stopChatObserver();
            sendResponse({ success: true });
            break;
    }
});

// --- 페이지 로드 시 초기화 ---
// Background에 현재 자동 입력 상태를 물어보고, 켜져 있으면 Observer 시작
chrome.runtime.sendMessage({ action: "getAutoSendStatus" })
    .then(response => {
        if (response) { // 응답이 있는지 확인
             if (response.isAutoSending) {
                console.log("페이지 로드: 자동 입력 활성 상태 감지, 감시 시작.");
                startChatObserver(); // 새로 시작
                if (response.isPaused) {
                    isSpamGuardPaused = true; // Content 상태 동기화
                    console.log("페이지 로드: 자동 입력이 일시정지 상태입니다.");
                }
            } else {
                 console.log("페이지 로드: 자동 입력 비활성 상태.");
            }
        } else {
             console.log("페이지 로드: Background로부터 상태 응답 없음.");
        }

    })
    .catch(e => console.error("초기 상태 확인 실패:", e)); // 오류 처리 개선