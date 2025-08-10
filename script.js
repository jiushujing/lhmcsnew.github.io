document.addEventListener('DOMContentLoaded', () => {

    // --- DOM ELEMENTS ---
    const dom = {
        // Main Chat
        messageList: document.getElementById('message-list'),
        chatInput: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn'),
        newChatBtn: document.getElementById('new-chat-btn'),
        refreshBtn: document.getElementById('refresh-btn'),
        systemPromptInput: document.getElementById('system-prompt-input'),
        apiSettingsBtn: document.getElementById('api-settings-btn'),
        // Modal & API Form
        modalOverlay: document.getElementById('api-modal-overlay'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        apiSettingsForm: document.getElementById('api-settings-form'),
        apiUrlInput: document.getElementById('api-url'),
        apiKeyInput: document.getElementById('api-key'),
        modelSelect: document.getElementById('model-select'),
        fetchModelsButton: document.getElementById('fetch-models-button'),
        btnOpenAI: document.getElementById('btn-openai'),
        btnGemini: document.getElementById('btn-gemini'),
        openaiModelsGroup: document.getElementById('openai-models'),
        geminiModelsGroup: document.getElementById('gemini-models'),
    };

    // --- STATE MANAGEMENT ---
    let conversationHistory = [];
    let apiSettings = {};
    let isSending = false;
    let currentApiType = 'openai';
    const SETTINGS_KEY = 'aiChatApiSettings';
    const defaultModels = {
        openai: { "gpt-3.5-turbo": "GPT-3.5-Turbo" },
        gemini: { "gemini-pro": "Gemini Pro" }
    };

    // --- MODAL CONTROL ---
    const openApiModal = () => dom.modalOverlay.classList.add('active');
    const closeApiModal = () => dom.modalOverlay.classList.remove('active');

    // --- API FORM LOGIC ---
    const populateModels = (models, type) => {
        const group = type === 'openai' ? dom.openaiModelsGroup : dom.geminiModelsGroup;
        group.innerHTML = '';
        Object.entries(models).forEach(([id, name]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            group.appendChild(option);
        });
    };

    const restoreSelection = (modelId) => {
        if (modelId && Array.from(dom.modelSelect.options).some(opt => opt.value === modelId)) {
            dom.modelSelect.value = modelId;
        }
    };

    const updateApiForm = (apiType) => {
        currentApiType = apiType;
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        const isGemini = apiType === 'gemini';
        dom.btnOpenAI.classList.toggle('active', !isGemini);
        dom.btnGemini.classList.toggle('active', isGemini);
        dom.openaiModelsGroup.hidden = isGemini;
        dom.geminiModelsGroup.hidden = !isGemini;
        dom.apiUrlInput.disabled = isGemini;
        dom.apiUrlInput.value = isGemini ? 'https://generativelanguage.googleapis.com' : (settings.openaiApiUrl || '');
        dom.apiKeyInput.value = isGemini ? (settings.geminiApiKey || '') : (settings.openaiApiKey || '');
        dom.apiUrlInput.placeholder = isGemini ? 'Gemini官方地址，无需修改' : '格式参考 https://example.com';
        dom.apiKeyInput.placeholder = isGemini ? 'AIzaSy...' : 'sk-xxxxxxxxxx';
        restoreSelection(settings.model);
    };

    const fetchModels = async () => {
        const apiKey = dom.apiKeyInput.value.trim();
        const previouslySelectedModel = dom.modelSelect.value;
        dom.fetchModelsButton.textContent = '正在拉取...';
        dom.fetchModelsButton.disabled = true;
        try {
            let fetchedModels;
            if (currentApiType === 'openai') {
                const baseUrl = dom.apiUrlInput.value.trim();
                if (!baseUrl || !apiKey) throw new Error('请先填写 API 地址和密钥！');
                const response = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                const data = await response.json();
                fetchedModels = data.data.reduce((acc, model) => ({ ...acc, [model.id]: model.id }), {});
            } else {
                if (!apiKey) throw new Error('请先填写 Gemini API Key！');
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                const data = await response.json();
                fetchedModels = data.models
                    .filter(m => (m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent')))
                    .reduce((acc, model) => ({ ...acc, [model.name.split('/').pop()]: model.displayName }), {});
            }
            if (Object.keys(fetchedModels).length === 0) throw new Error("API未返回任何可用模型");
            populateModels(fetchedModels, currentApiType);
            if (Object.keys(fetchedModels)[0]) dom.modelSelect.value = Object.keys(fetchedModels)[0];
            restoreSelection(previouslySelectedModel);
        } catch (error) {
            alert(`拉取模型失败: ${error.message}\n将恢复为默认列表。`);
            populateModels(defaultModels[currentApiType], currentApiType);
        } finally {
            dom.fetchModelsButton.textContent = '拉取模型';
            dom.fetchModelsButton.disabled = false;
        }
    };

    const saveApiSettings = () => {
        let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        settings.apiType = currentApiType;
        settings.model = dom.modelSelect.value;
        if (currentApiType === 'gemini') {
            settings.geminiApiKey = dom.apiKeyInput.value.trim();
        } else {
            settings.openaiApiUrl = dom.apiUrlInput.value.trim();
            settings.openaiApiKey = dom.apiKeyInput.value.trim();
        }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        alert('API设定已保存！');
        closeApiModal();
        loadAndCheckApiSettings();
    };
    
    const initializeApiForm = () => {
        populateModels(defaultModels.openai, 'openai');
        populateModels(defaultModels.gemini, 'gemini');
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        updateApiForm(settings.apiType || 'openai');
    };

    // --- MAIN CHAT LOGIC ---
    const loadAndCheckApiSettings = () => {
        const settingsStr = localStorage.getItem(SETTINGS_KEY);
        if (!settingsStr) {
            openApiModal();
            return false;
        }
        apiSettings = JSON.parse(settingsStr);
        const { apiType, model } = apiSettings;
        const apiKey = apiType === 'gemini' ? apiSettings.geminiApiKey : apiSettings.openaiApiKey;
        const apiUrl = apiType === 'openai' ? apiSettings.openaiApiUrl : '';
        if (!model || !apiKey || (apiType === 'openai' && !apiUrl)) {
            openApiModal();
            return false;
        }
        return true;
    };

    const addMessageToUI = (sender, text) => {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message ${sender}`;
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = `<i class="fas ${sender === 'user' ? 'fa-user' : 'fa-robot'}"></i>`;
        const content = document.createElement('div');
        content.className = 'content';
        if (text === '...thinking...') {
             content.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        } else {
            const p = document.createElement('p');
            p.textContent = text;
            content.appendChild(p);
        }
        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(content);
        dom.messageList.appendChild(messageWrapper);
        dom.messageList.parentElement.scrollTop = dom.messageList.parentElement.scrollHeight;
        return content;
    };

    const handleSendMessage = async () => {
        const userInput = dom.chatInput.value.trim();
        if (!userInput || isSending) return;
        if (!loadAndCheckApiSettings()) return;
        isSending = true;
        dom.sendBtn.disabled = true;
        dom.chatInput.value = '';
        autoResizeTextarea();
        addMessageToUI('user', userInput);
        conversationHistory.push({ role: 'user', content: userInput });
        const thinkingMessageContent = addMessageToUI('assistant', '...thinking...');
        try {
            await callApi(thinkingMessageContent);
        } catch (error) {
            console.error('API Call Error:', error);
            thinkingMessageContent.innerHTML = `<p>出错了: ${error.message}</p>`;
        } finally {
            isSending = false;
            dom.sendBtn.disabled = false;
            dom.messageList.parentElement.scrollTop = dom.messageList.parentElement.scrollHeight;
        }
    };

    const callApi = async (targetElement) => {
        const { apiType, model } = apiSettings;
        let finalResponseText = '';
        targetElement.innerHTML = '<p></p>';
        const pElement = targetElement.querySelector('p');
        const systemPrompt = dom.systemPromptInput.value.trim();
        let messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages = messages.concat(conversationHistory);

        try {
            if (apiType === 'openai') {
                const response = await fetch(`${apiSettings.openaiApiUrl}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiSettings.openaiApiKey}` }, body: JSON.stringify({ model, messages, stream: true }) });
                if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                while(true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
                    for (const line of lines) {
                        const jsonStr = line.replace('data: ', '');
                        if (jsonStr.includes('[DONE]')) continue;
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const delta = parsed.choices[0]?.delta?.content || '';
                            if (delta) {
                                finalResponseText += delta;
                                pElement.textContent = finalResponseText;
                                dom.messageList.parentElement.scrollTop = dom.messageList.parentElement.scrollHeight;
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            } else { // Gemini
                 const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiSettings.geminiApiKey}&alt=sse`;
                 const geminiContents = messages.map(msg => ({ role: msg.role === 'assistant' ? 'model' : msg.role, parts: [{ text: msg.content }] }));
                 const response = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: geminiContents }) });
                 if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
                 const reader = response.body.getReader();
                 const decoder = new TextDecoder();
                 while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
                    for (const line of lines) {
                        const jsonStr = line.replace('data: ', '');
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const delta = parsed.candidates[0]?.content?.parts[0]?.text || '';
                            if (delta) {
                                finalResponseText += delta;
                                pElement.textContent = finalResponseText;
                                dom.messageList.parentElement.scrollTop = dom.messageList.parentElement.scrollHeight;
                            }
                        } catch (e) { /* ignore */ }
                    }
                 }
            }
        } catch (error) {
            finalResponseText = `API 请求失败: ${error.message}`;
            pElement.textContent = finalResponseText;
        }

        if (finalResponseText) {
            conversationHistory.push({ role: 'assistant', content: finalResponseText });
        }
    };
    
    const handleNewChat = () => {
        conversationHistory = [];
        dom.messageList.innerHTML = '';
        addMessageToUI('assistant', '你好！一个全新的对话已经开始。');
        isSending = false;
        dom.sendBtn.disabled = false;
        dom.chatInput.value = '';
    };

    const autoResizeTextarea = () => {
        dom.chatInput.style.height = 'auto';
        dom.chatInput.style.height = `${dom.chatInput.scrollHeight}px`;
    };

    // --- EVENT LISTENERS ---
    dom.sendBtn.addEventListener('click', handleSendMessage);
    dom.newChatBtn.addEventListener('click', handleNewChat);
    dom.refreshBtn.addEventListener('click', handleNewChat);
    dom.chatInput.addEventListener('input', autoResizeTextarea);
    dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    dom.apiSettingsBtn.addEventListener('click', openApiModal);
    dom.closeModalBtn.addEventListener('click', closeApiModal);
    dom.modalOverlay.addEventListener('click', (e) => {
        if (e.target === dom.modalOverlay) closeApiModal();
    });
    dom.btnOpenAI.addEventListener('click', () => updateApiForm('openai'));
    dom.btnGemini.addEventListener('click', () => updateApiForm('gemini'));
    dom.saveSettingsBtn.addEventListener('click', saveApiSettings);
    dom.fetchModelsButton.addEventListener('click', fetchModels);
    dom.apiKeyInput.addEventListener('focus', () => { dom.apiKeyInput.type = 'text'; });
    dom.apiKeyInput.addEventListener('blur', () => { dom.apiKeyInput.type = 'password'; });

    // --- INITIAL LOAD ---
    initializeApiForm();
    loadAndCheckApiSettings();
});
