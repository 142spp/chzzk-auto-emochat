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
    MIN_DELAY: 500, // 최소 허용 딜레이 (설정값보다 우선)
    MANUAL_DELAY: 1000, // 수동 입력 간격 제한
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

// --- 상태 관리 ---
let state = {
    lastExecutionTime: 0,    // 수동 실행 마지막 시간
    isAutoSending: false,    // 자동 전송 활성 상태
    autoSendTimeoutId: null, // 자동 전송 예약 ID
    isExecuting: false       // 수동/자동 실행 중복 방지 플래그
};

// --- 유틸리티 함수 (탭 관련) ---

/**
 * 활성화된 치지직 탭 정보를 가져옵니다.
 * @returns {Promise<chrome.tabs.Tab | null>} 탭 객체 또는 null
 * @throws {Error} 치지직 탭을 찾지 못한 경우
 */
async function getActiveChzzkTab() {
    try {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
            url: CONSTANTS.CHZZK_URL_PATTERN
        });
        if (tabs.length === 0) {
            // 오류를 던지는 대신 null 반환하여 호출 측에서 처리하도록 변경
            console.log("활성 치지직 탭 없음");
            return null;
        }
        return tabs[0];
    } catch (error) {
        console.error("활성 탭 조회 중 오류:", error);
        throw new Error("활성 탭을 찾는 중 오류가 발생했습니다."); // 호출 측에 오류 전파
    }
}

/**
 * 활성 치지직 탭에 토스트 메시지를 표시하도록 요청합니다.
 * @param {string} message - 표시할 메시지
 */
async function showToastInActiveTab(message) {
    try {
        const tab = await getActiveChzzkTab();
        if (!tab || !tab.id) {
            console.log("토스트 표시 실패: 활성 치지직 탭 없음");
            return;
        }
        await chrome.tabs.sendMessage(tab.id, {
            action: "showToast",
            message
        });
    } catch (error) {
        // content script와 통신 실패 등
        console.warn("토스트 메시지 전송 실패:", error.message);
        // 연결 실패는 흔할 수 있으므로, 사용자에게 오류를 직접 표시하지 않을 수 있음
    }
}

/**
 * 활성 치지직 탭에 이모티콘 전송을 트리거하도록 요청합니다.
 * @param {boolean} isAuto - 자동 전송 여부
 * @returns {Promise<boolean>} 성공 여부
 */
async function sendEmoticonTriggerToActiveTab(isAuto = true) {
    let tab;
    try {
        tab = await getActiveChzzkTab();
        if (!tab || !tab.id) {
            throw new Error("활성 치지직 탭을 찾을 수 없습니다.");
        }

        // content script에 메시지 전송 및 응답 대기
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "injectAndSendTrigger",
            isAuto
        });

        // 응답 구조 확인 (content script의 handleMessage 반환값)
        if (response && response.success) {
            console.log(`이모티콘 트리거 전송 성공 (자동: ${isAuto})`);
            return true;
        } else {
            console.error("Content script 응답 오류 또는 실패:", response);
            throw new Error(response?.error || "Content script에서 작업 실패");
        }
    } catch (error) {
        console.error(`이모티콘 트리거 전송 실패 (자동: ${isAuto}):`, error.message);
        // 사용자에게 오류 피드백
        const tabId = tab?.id;
        if (tabId && error.message.includes("Could not establish connection")) {
             // showToastInActiveTab("페이지 연결 오류. 새로고침 후 시도하세요."); // 너무 빈번할 수 있음
             console.warn("Content script 연결 실패. 탭이 로딩 중이거나 권한 문제가 있을 수 있습니다.");
        } else if (tabId) {
             // Content script 내부 오류 등
             showToastInActiveTab(`오류: ${error.message}`);
        }
        // 실패 시 false 반환하여 자동 전송 중단 등 후속 처리 가능하게 함
        return false;
    }
}

// --- 아이콘 배지 관리 ---

/**
 * 확장 프로그램 아이콘의 배지 텍스트와 색상을 업데이트합니다.
 */
function updateIconBadge() {
    const badgeText = state.isAutoSending ? CONSTANTS.BADGE_TEXTS.ACTIVE : CONSTANTS.BADGE_TEXTS.INACTIVE;
    const color = state.isAutoSending ? CONSTANTS.BADGE_COLORS.ACTIVE : CONSTANTS.BADGE_COLORS.DEFAULT;

    try {
        chrome.action.setBadgeText({ text: badgeText });
        chrome.action.setBadgeBackgroundColor({ color });
    } catch (error) {
        console.error("아이콘 배지 업데이트 실패:", error);
        // Manifest 설정 오류 등이 있을 수 있음
    }
}

// --- 자동 전송 관리 ---

/**
 * 자동 전송 타이머를 해제합니다.
 */
function clearAutoSendTimeout() {
    if (state.autoSendTimeoutId) {
        clearTimeout(state.autoSendTimeoutId);
        state.autoSendTimeoutId = null;
        console.log("자동 전송 예약 취소됨");
    }
}

/**
 * 자동 이모티콘 전송을 시작합니다.
 */
async function startAutoSend() {
    if (state.isAutoSending) {
        console.log("이미 자동 입력이 활성화되어 있습니다.");
        return;
    }

    state.isAutoSending = true;
    updateIconBadge();
    console.log("자동 이모티콘 입력 시작됨.");
    await showToastInActiveTab("자동 입력 시작됨");
    scheduleNextAutoSend(); // 첫 실행 예약
}

/**
 * 자동 이모티콘 전송을 중지합니다.
 * @param {string} [reason="사용자 요청"] - 중지 사유
 */
function stopAutoSend(reason = "사용자 요청") {
    if (!state.isAutoSending) {
        console.log("자동 입력이 이미 비활성화되어 있습니다.");
        return;
    }

    clearAutoSendTimeout();
    state.isAutoSending = false;
    updateIconBadge();
    console.log(`자동 이모티콘 입력 중지 (${reason})`);
    showToastInActiveTab("자동 입력 중지됨"); // 비동기 호출, 실패 가능성 있음
}

/**
 * 다음 자동 이모티콘 전송을 예약합니다.
 */
async function scheduleNextAutoSend() {
    if (!state.isAutoSending) {
        console.log("자동 실행 예약 중단됨 (비활성 상태).");
        return;
    }

    // 설정 읽기 (최신 설정 반영)
    let settings;
    try {
        const result = await chrome.storage.sync.get([CONSTANTS.STORAGE_KEYS.SETTINGS]);
        settings = { ...CONSTANTS.DEFAULT_SETTINGS, ...result[CONSTANTS.STORAGE_KEYS.SETTINGS] };
    } catch (error) {
        console.error("자동 실행 예약 위한 설정 읽기 실패:", error);
        showToastInActiveTab("설정 읽기 오류로 자동 입력 중지됨");
        stopAutoSend("설정 읽기 오류");
        return;
    }

    // 딜레이 계산 (설정값 및 최소값 제한 고려)
    const minDelay = Math.max(CONSTANTS.MIN_DELAY, settings.minDelay);
    const maxDelay = Math.max(minDelay, settings.maxDelay);
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    console.log(`다음 자동 실행 ${randomDelay}ms 후에 예약됨`);

    // 타이머 설정
    state.autoSendTimeoutId = setTimeout(async () => {
        if (!state.isAutoSending) {
            console.log("Timeout 실행 시점: 자동 실행 비활성됨.");
            return;
        }
        if (state.isExecuting) {
            console.log("Timeout 실행 시점: 다른 작업 실행 중. 다음 예약으로 건너뜁니다.");
            scheduleNextAutoSend(); // 바로 다음 예약 시도
            return;
        }

        state.isExecuting = true; // 실행 플래그 설정
        try {
            const success = await sendEmoticonTriggerToActiveTab(true);
            if (success) {
                // 성공 시 다음 예약
                scheduleNextAutoSend();
            } else {
                // 실패 시 자동 전송 중지
                console.error("자동 입력 중 오류 발생 또는 content script 실패, 자동 입력 중지");
                stopAutoSend("실행 중 오류");
            }
        } catch (error) {
            // sendEmoticonTriggerToActiveTab 내부에서 처리되지 않은 예외
            console.error("자동 입력 처리 중 예상치 못한 오류:", error);
            stopAutoSend(`예상치 못한 오류 (${error.message})`);
        } finally {
            state.isExecuting = false; // 실행 플래그 해제
        }
    }, randomDelay);
}

// --- 메시지 핸들러 (Content Script 통신) ---

/**
 * Content script로부터 오는 메시지를 처리합니다.
 * (주로 Main World 변수 접근 요청 처리)
 * @param {Object} message - 메시지 객체
 * @param {chrome.runtime.MessageSender} sender - 송신자 정보
 * @returns {Promise<any>} 처리 결과 또는 Promise
 */
async function handleContentScriptMessage(message, sender) {
    console.log(`[Background] Content Script 메시지 수신: ${message.type}`, message);

    // 송신자 탭 ID 확인
    const tabId = sender?.tab?.id;
    if (!tabId) {
        console.error("메시지 송신자 탭 ID를 확인할 수 없습니다.", sender);
        return { success: false, error: "Invalid sender tab" };
    }

    try {
        switch (message.type) {
            case "getVariable":
                if (typeof message.value !== 'string') throw new Error("Invalid variable name");
                const [{ result }] = await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: (variableName) => window[variableName],
                    args: [message.value],
                    world: "MAIN"
                });
                console.log(`[Background] getVariable (${message.value}) 결과:`, result);
                return result; // 결과 직접 반환 (Content Script에서 처리)

            case "setVariable":
                if (!message.value || typeof message.value.name !== 'string') throw new Error("Invalid variable data");
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: (name, value) => { window[name] = value; },
                    args: [message.value.name, message.value.value],
                    world: "MAIN"
                });
                console.log(`[Background] setVariable (${message.value.name}) 완료`);
                return { success: true }; // 성공 여부 반환

            // case "callWindowFunction": // 현재 사용되지 않음 (필요 시 복원)
            //     if (!message.value || typeof message.value.functionName !== 'string') throw new Error("Invalid function data");
            //     const funcName = message.value.functionName;
            //     const args = message.value.args || [];
            //     const [{ result: funcResult }] = await chrome.scripting.executeScript({
            //         target: { tabId: tabId },
            //         func: (funcName, args) => {
            //             const func = window[funcName];
            //             if (typeof func !== 'function') {
            //                 throw new Error(`함수를 찾을 수 없음: ${funcName}`);
            //             }
            //             return func.apply(window, args);
            //         },
            //         args: [funcName, args],
            //         world: "MAIN"
            //     });
            //     return funcResult;

            default:
                console.warn("[Background] Content Script로부터 알 수 없는 메시지 타입:", message.type);
                return { success: false, error: "Unknown message type" };
        }
    } catch (error) {
        console.error(`[Background] Content Script 메시지 처리 중 오류 (${message.type}):`, error);
        // executeScript 오류 등
        let errorMessage = error.message;
        if (errorMessage.includes("No tab with id")) {
            errorMessage = "메시지를 보낸 탭을 찾을 수 없습니다.";
        } else if (errorMessage.includes("Cannot access contents of url")) {
            errorMessage = "페이지 접근 권한이 없습니다. URL 또는 Manifest 설정을 확인하세요.";
        } else if (errorMessage.includes("Error evaluating script")) {
             errorMessage = "페이지 내 스크립트 실행 중 오류가 발생했습니다.";
        }
        return { success: false, error: errorMessage };
    }
}

// --- 단축키 핸들러 ---

/**
 * 단축키 명령을 처리합니다.
 * @param {string} command - 실행된 단축키 명령 ID
 */
async function handleCommand(command) {
    console.log(`[Background] 단축키 감지: ${command}`);

    if (command === "trigger-emoticon") { // 수동 입력
        const currentTime = Date.now();

        if (state.isExecuting) {
            console.log("다른 작업이 이미 실행 중입니다. (수동 입력)");
            showToastInActiveTab("다른 작업 실행 중... 잠시 후 시도하세요.");
            return;
        }
        if (currentTime - state.lastExecutionTime < CONSTANTS.MANUAL_DELAY) {
            console.log("수동 입력 간격이 너무 짧습니다.");
            showToastInActiveTab("잠시 후 다시 시도해주세요.");
            return;
        }

        state.isExecuting = true; // 실행 플래그 설정
        state.lastExecutionTime = currentTime; // 시간 제한을 위해 먼저 기록

        try {
            const success = await sendEmoticonTriggerToActiveTab(false);
            if (success) {
                // 성공 시 추가 작업 필요 없음
            } else {
                // 실패 시 (오류 메시지는 sendEmoticonTriggerToActiveTab에서 표시)
                // 시간 제한 롤백 (선택 사항)
                // state.lastExecutionTime = 0;
            }
        } catch (error) {
            // sendEmoticonTriggerToActiveTab 내부에서 처리되지 않은 예외
            console.error("수동 입력 처리 중 예상치 못한 오류:", error);
            showToastInActiveTab(`수동 입력 오류: ${error.message}`);
        } finally {
            state.isExecuting = false; // 실행 플래그 해제
        }

    } else if (command === "toggle-auto-send") { // 자동 토글
        if (state.isAutoSending) {
            stopAutoSend();
        } else {
            await startAutoSend();
        }
    }
}

// --- 컨텍스트 메뉴 핸들러 ---

/**
 * 컨텍스트 메뉴 클릭 이벤트를 처리합니다.
 * @param {chrome.contextMenus.OnClickData} info - 클릭 정보
 * @param {chrome.tabs.Tab} tab - 클릭된 탭 정보
 */
async function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "addEmoticonToCache" && tab?.id) {
        console.log("[Background] 컨텍스트 메뉴 '이모티콘 추가' 클릭됨", info);
        if (!info.srcUrl || !info.srcUrl.startsWith('https://')) {
            console.error("잘못된 이미지 URL:", info.srcUrl);
            showToastInActiveTab("잘못된 이미지 형식입니다.");
            return;
        }

        try {
            // Content script를 통해 alt 텍스트 가져오기
            const [{ result: altText }] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (srcUrl) => {
                    const img = document.querySelector(`img[src="${srcUrl}"]`);
                    // alt 속성이 없거나 비어있으면 파일명에서 유추 시도
                    let name = img ? img.alt : null;
                    if (!name) {
                        try {
                            const urlParts = new URL(srcUrl).pathname.split('/');
                            name = urlParts[urlParts.length - 1].split('.')[0]; // 파일명 (확장자 제외)
                        } catch { name = 'unknown_emoticon'; }
                    }
                    // 이름에서 부적절한 문자 제거 (쉼표 등)
                    return name ? name.replace(/[{},:]/g, '').trim() : 'unknown_emoticon';
                },
                args: [info.srcUrl]
            });

            if (!altText) {
                 console.error("이미지 alt 텍스트를 가져올 수 없습니다.");
                 showToastInActiveTab("이모티콘 이름을 가져올 수 없습니다.");
                 return;
            }

            // Content script에 이모티콘 데이터 전달하여 캐시에 추가 요청
            await chrome.tabs.sendMessage(tab.id, {
                action: "addEmoticonToCache",
                emoticonData: {
                    url: info.srcUrl,
                    name: altText
                }
            });
            // 성공 메시지는 content script에서 표시

        } catch (error) {
            console.error("컨텍스트 메뉴 처리 중 오류:", error);
            let errorMsg = "이모티콘 추가 중 오류 발생";
            if (error.message.includes("Error evaluating script")) {
                 errorMsg = "페이지 내 스크립트 실행 오류";
            } else if (error.message.includes("Cannot access contents")) {
                 errorMsg = "페이지 접근 권한 오류";
            }
            showToastInActiveTab(errorMsg);
        }
    }
}


// --- 이벤트 리스너 등록 ---

/**
 * 서비스 워커 초기화 및 이벤트 리스너 등록
 */
function initializeServiceWorker() {
    // 설치 시 기본 설정 저장 및 컨텍스트 메뉴 생성
    chrome.runtime.onInstalled.addListener(async (details) => {
        console.log("확장 프로그램 설치/업데이트됨:", details.reason);
        try {
            // 기본 설정 저장 (기존 값 없을 때만)
            const currentSettings = await chrome.storage.sync.get(Object.keys(CONSTANTS.DEFAULT_SETTINGS));
            const updates = {};
            for (const [key, value] of Object.entries(CONSTANTS.DEFAULT_SETTINGS)) {
                if (currentSettings[key] === undefined) {
                    updates[key] = value;
                }
            }
            if (Object.keys(updates).length > 0) {
                await chrome.storage.sync.set(updates);
                console.log("기본 설정 저장됨:", updates);
            }
        } catch (error) {
            console.error("기본 설정 저장 실패:", error);
        }

        // 아이콘 배지 초기화
        updateIconBadge();

        // 컨텍스트 메뉴 생성 (기존 메뉴 있으면 업데이트 또는 재생성)
        chrome.contextMenus.create({
            id: "addEmoticonToCache",
            title: "이모티콘 추가",
            contexts: ["image"],
            documentUrlPatterns: ["https://chzzk.naver.com/*"]
        }, () => {
            if (chrome.runtime.lastError) {
                console.warn("컨텍스트 메뉴 생성/업데이트 오류:", chrome.runtime.lastError.message);
            }
        });
    });

    // 브라우저 시작 시 상태 초기화
    chrome.runtime.onStartup.addListener(() => {
        console.log("브라우저 시작됨. 상태 초기화.");
        state.isAutoSending = false;
        state.autoSendTimeoutId = null;
        state.isExecuting = false;
        updateIconBadge();
    });

    // 메시지 리스너 (Content Script 통신용)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Content script로부터 온 메시지만 처리
        if (sender.tab) {
            handleContentScriptMessage(message, sender)
                .then(sendResponse)
                .catch(error => {
                    console.error("[Background] 비동기 메시지 처리 오류:", error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 비동기 응답을 위해 true 반환
        }
        // 다른 출처(예: popup) 메시지는 여기서 처리 안 함
        return false;
    });

    // 단축키 리스너
    chrome.commands.onCommand.addListener(handleCommand);

    // 컨텍스트 메뉴 클릭 리스너
    chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

    console.log("백그라운드 서비스 워커 초기화 완료.");
}

// 서비스 워커 실행 시 초기화 함수 호출
initializeServiceWorker();
