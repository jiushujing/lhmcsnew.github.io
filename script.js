document.addEventListener('DOMContentLoaded', () => {
    // --- Combined DOM Element References ---
    // 检查关键元素是否存在，如果不存在则提前终止，防止后续代码出错
    if (!document.getElementById('chat-view') || !document.getElementById('settings-view')) {
        // This check is for app.html. If it's index.html, these elements won't exist, which is fine.
        // We only proceed if the core app elements are present.
        return;
    }

    const dom = {
        // Main App & Chat
        chatView: document.getElementById('chat-view'),
        settingsView: document.getElementById('settings-view'),
        navChat: document.getElementById('nav-chat'),
        navSettings: document.getElementById('nav-settings'),
        chatForm: document.getElementById('chat-form'),
        userInput: document.getElementById('user-input'),
        chatHistory: document.getElementById('chat-history'),
        sendButton: document.getElementById('send-button'),
        toggleSystemPromptBtn: document.getElementById('toggle-system-prompt'),
        systemPromptContainer: document.getElementById('system-prompt-container'),
        systemPrompt: document.getElementById('system-prompt'),
        // API Settings
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

    // --- State and Constants ---
    const SETTINGS_KEY = 'aiChatApiSettings';
    let currentApiType = 'openai';
    let conversationHistory = []; // For chat context
    const defaultModels = {
        openai: { "gpt-3.5-turbo": "GPT-3.5-Turbo" },
        gemini: { "gemini-pro": "Gemini Pro" }
    };

    // ==================================================
    // --- FUNCTION DEFINITIONS (COMPLETE) ---
    // ==================================================

    // --- API SETTINGS FUNCTIONS ---
    const populateModels = (models, type) => {
        const group = type === 'openai' ? dom.openaiModelsGroup : dom.geminiModelsGroup;
        group.innerHTML = '';
        for (const [id, name] of Object.entries(models)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            group.appendChild(option);
        }
    };

    const restoreSelection = (modelId) => {
        if (!modelId || !dom.modelSelect) return;
        const optionExists = Array.from(dom.modelSelect.options).some(opt => opt.value === modelId);
        if (optionExists) {
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
        dom.apiKeyInput.placeholder = isGemini ? 'AIzaSy... (Gemini API Key)' : 'sk-xxxxxxxxxx';
        
        restoreSelection(settings.model);
    };

    const fetchModels = async () => {
        const apiKey = dom.apiKeyInput.value.trim();
        const previouslySelectedModel = dom.modelSelect.value;
        dom.fetchModelsButton.textContent = '正在拉取...';
        dom.fetchModelsButton.disabled = true;

        try {
            if (currentApiType === 'openai') {
                const baseUrl = dom.apiUrlInput.value.trim();
                if (!baseUrl || !apiKey) throw new Error('请先填写 API 地址和密钥！');
                
                const response = await fetch(`${baseUrl}/v1/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                const data = await response.json();
                
                const fetchedModels = data.data.reduce((acc, model) => ({ ...acc, [model.id]: model.id }), {});
                if (Object.keys(fetchedModels).length === 0) throw new Error("API未返回任何模型");
                
                populateModels(fetchedModels, 'openai');
                if (Object.keys(fetchedModels)[0]) dom.modelSelect.value = Object.keys(fetchedModels)[0];

            } else { // Gemini
                if (!apiKey) throw new Error('请先填写 Gemini API Key！');
                
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                const data = await response.json();
                
                const filteredModels = data.models
                    .filter(m => (m.name.includes('gemini-1.5-pro') || m.name.includes('gemini-1.5-flash') || m.name.includes('gemini-pro')) && m.supportedGenerationMethods.includes('generateContent'))
                    .reduce((acc, model) => ({ ...acc, [model.name.split('/').pop()]: model.displayName }), {});
                
                if (Object.keys(filteredModels).length === 0) throw new Error("未找到符合条件的Gemini模型");
                
                populateModels(filteredModels, 'gemini');
                if (Object.keys(filteredModels)[0]) dom.modelSelect.value = Object.keys(filteredModels)[0];
            }
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
    };

    const loadApiSettings = () => {
        populateModels(defaultModels.openai, 'openai');
        populateModels(defaultModels.gemini, 'gemini');
        
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        updateApiForm(settings.apiType || 'openai');
    };

    // --- MAIN APP & CHAT FUNCTIONS ---
    function switchView(viewToShow) {
        dom.chatView.classList.remove('active');
        dom.settingsView.classList.remove('active');
        dom.navChat.classList.remove('active');
        dom.navSettings.classList.remove('active');

        if (viewToShow === 'chat') {
            dom.chatView.classList.add('active');
            dom.navChat.classList.add('active');
        } else {
            dom.settingsView.classList.add('active');
            dom.navSettings.classList.add('active');
        }
    }

    function displayMessage(text, sender, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message', `${sender}-message`);
        if (isError) messageDiv.classList.add('error-message');
        
        const p = document.createElement('p');
        p.textContent = text;
        messageDiv.appendChild(p);
        
        dom.chatHistory.appendChild(messageDiv);
        dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
    }

    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.classList.add('chat-message', 'ai-message', 'typing-indicator');
        indicator.textContent = 'AI 正在输入...';
        dom.chatHistory.appendChild(indicator);
        dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    async function handleChatSubmit(e) {
        e.preventDefault();
        const userMessage = dom.userInput.value.trim();
        if (!userMessage) return;

        displayMessage(userMessage, 'user');
        conversationHistory.push({ role: 'user', content: userMessage });
        dom.userInput.value = '';
        dom.userInput.style.height = 'auto';
        showTypingIndicator();

        const settingsStr = localStorage.getItem(SETTINGS_KEY);
        if (!settingsStr) {
            removeTypingIndicator();
            displayMessage('错误：未找到API设定。请先在“设定”页面配置并保存。', 'ai', true);
            return;
        }
        const settings = JSON.parse(settingsStr);

        let requestUrl, requestOptions;
        try {
            if (settings.apiType === 'gemini') {
                if (!settings.geminiApiKey || !settings.model) throw new Error('Gemini API Key 或模型未设置。');
                requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.geminiApiKey}`;
                const contents = conversationHistory.map(msg => ({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] }));
                const systemPromptText = dom.systemPrompt.value.trim();
                let system_instruction = systemPromptText ? { role: "user", parts: [{ text: systemPromptText }] } : null;
                requestOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents, ...(system_instruction && { system_instruction }) }) };
            } else {
                if (!settings.openaiApiKey || !settings.openaiApiUrl || !settings.model) throw new Error('OpenAI API 地址、密钥或模型未设置。');
                requestUrl = `${settings.openaiApiUrl}/v1/chat/completions`;
                let messages = [...conversationHistory];
                const systemPromptText = dom.systemPrompt.value.trim();
                if (systemPromptText) messages.unshift({ role: 'system', content: systemPromptText });
                requestOptions = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openaiApiKey}` }, body: JSON.stringify({ model: settings.model, messages: messages }) };
            }
        } catch(error) {
            removeTypingIndicator();
            displayMessage(`配置错误：${error.message}`, 'ai', true);
            return;
        }

        try {
            const response = await fetch(requestUrl, requestOptions);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP 错误: ${response.status}`);
            }
            const data = await response.json();
            let aiResponse = settings.apiType === 'gemini' ? data.candidates[0]?.content?.parts[0]?.text : data.choices[0]?.message?.content;
            if (!aiResponse) throw new Error('API返回的数据格式不正确或内容为空。');
            removeTypingIndicator();
            displayMessage(aiResponse, 'ai');
            conversationHistory.push({ role: 'assistant', content: aiResponse });
        } catch (error) {
            removeTypingIndicator();
            displayMessage(`请求失败: ${error.message}`, 'ai', true);
            conversationHistory.pop();
        }
    }

    // ===============================================
    // --- EVENT LISTENERS & INITIALIZATION ---
    // ===============================================

    // API Settings Listeners
    dom.btnOpenAI.addEventListener('click', () => updateApiForm('openai'));
    dom.btnGemini.addEventListener('click', () => updateApiForm('gemini'));
    dom.apiSettingsForm.addEventListener('submit', (e) => { e.preventDefault(); saveApiSettings(); });
    dom.fetchModelsButton.addEventListener('click', (e) => { e.preventDefault(); fetchModels(); });
    dom.apiKeyInput.addEventListener('focus', () => { dom.apiKeyInput.type = 'text'; });
    dom.apiKeyInput.addEventListener('blur', () => { dom.apiKeyInput.type = 'password'; });

    // Main App Listeners
    dom.navChat.addEventListener('click', () => switchView('chat'));
    dom.navSettings.addEventListener('click', () => switchView('settings'));
    dom.toggleSystemPromptBtn.addEventListener('click', () => dom.systemPromptContainer.classList.toggle('hidden'));
    dom.userInput.addEventListener('input', () => { dom.userInput.style.height = 'auto'; dom.userInput.style.height = (dom.userInput.scrollHeight) + 'px'; });
    dom.chatForm.addEventListener('submit', handleChatSubmit);

    // --- Initial Load ---
    loadApiSettings();
    switchView('chat');
});
