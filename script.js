document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Element References ---
    const dom = {
        messageList: document.getElementById('message-list'),
        chatInput: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn'),
        newChatBtn: document.getElementById('new-chat-btn'),
        systemPromptInput: document.getElementById('system-prompt-input')
    };

    // --- State Management ---
    let conversationHistory = [];
    let apiSettings = {};
    let isSending = false;
    const SETTINGS_KEY = 'aiChatApiSettings';

    // --- Core Functions ---

    /**
     * Loads API settings from localStorage. Redirects if not found.
     */
    const loadApiSettings = () => {
        const settingsStr = localStorage.getItem(SETTINGS_KEY);
        if (!settingsStr) {
            alert('尚未配置API，请先完成API设定。');
            window.location.href = 'api_settings.html';
            return false;
        }
        apiSettings = JSON.parse(settingsStr);
        
        const { apiType, model } = apiSettings;
        const apiKey = apiType === 'gemini' ? apiSettings.geminiApiKey : apiSettings.openaiApiKey;
        const apiUrl = apiType === 'openai' ? apiSettings.openaiApiUrl : '';

        if (!model || !apiKey || (apiType === 'openai' && !apiUrl)) {
            alert('API配置不完整，请检查API设定。');
            window.location.href = 'api_settings.html';
            return false;
        }
        return true;
    };

    /**
     * Adds a message to the UI.
     * @param {string} sender - 'user' or 'assistant'.
     * @param {string} text - The message content.
     * @returns {HTMLElement} The content element of the new message.
     */
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
        dom.messageList.scrollTop = dom.messageList.scrollHeight;

        return content;
    };

    /**
     * Handles sending the message and calling the API.
     */
    const handleSendMessage = async () => {
        const userInput = dom.chatInput.value.trim();
        if (!userInput || isSending) return;

        if (!loadApiSettings()) return; // Re-check settings before sending

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
            dom.messageList.scrollTop = dom.messageList.scrollHeight;
        }
    };
    
    /**
     * Calls the appropriate API (OpenAI compatible or Gemini) with streaming.
     * @param {HTMLElement} targetElement - The UI element to update with the streaming response.
     */
    const callApi = async (targetElement) => {
        const { apiType, model } = apiSettings;
        let finalResponseText = '';
        targetElement.innerHTML = '<p></p>'; // Clear thinking dots
        const pElement = targetElement.querySelector('p');

        const systemPrompt = dom.systemPromptInput.value.trim();
        let messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages = messages.concat(conversationHistory);

        // --- OpenAI API Call ---
        if (apiType === 'openai') {
            const response = await fetch(`${apiSettings.openaiApiUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiSettings.openaiApiKey}`
                },
                body: JSON.stringify({ model, messages, stream: true })
            });

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
                    if (jsonStr === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const delta = parsed.choices[0]?.delta?.content || '';
                        if (delta) {
                            finalResponseText += delta;
                            pElement.textContent = finalResponseText;
                            dom.messageList.scrollTop = dom.messageList.scrollHeight;
                        }
                    } catch (e) {
                        console.error("Error parsing stream chunk:", e);
                    }
                }
            }
        } 
        // --- Gemini API Call ---
        else if (apiType === 'gemini') {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiSettings.geminiApiKey}`;
            // Gemini requires a different message format
            const geminiContents = messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : msg.role,
                parts: [{ text: msg.content }]
            }));

            const response = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: geminiContents })
            });
            
            if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                // Gemini stream is not line-delimited JSON, but a stream of JSON objects
                // We'll just look for text parts for simplicity
                try {
                    // This is a simplified parser. A robust one would handle incomplete JSON objects.
                    const jsonObjects = JSON.parse(`[${buffer.replace(/}\s*{/g, '},{')}]`);
                    let combinedText = '';
                    jsonObjects.forEach(obj => {
                        combinedText += obj.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    });
                    finalResponseText = combinedText;
                    pElement.textContent = finalResponseText;
                    dom.messageList.scrollTop = dom.messageList.scrollHeight;
                } catch(e) {
                    // Incomplete JSON, wait for more data
                }
            }
        }

        if (finalResponseText) {
            conversationHistory.push({ role: 'assistant', content: finalResponseText });
        }
    };
    
    /**
     * Resets the chat state and UI.
     */
    const handleNewChat = () => {
        conversationHistory = [];
        dom.messageList.innerHTML = '';
        addMessageToUI('assistant', '你好！一个全新的对话已经开始。');
        isSending = false;
        dom.sendBtn.disabled = false;
    };

    /**
     * Auto-resizes the textarea based on content.
     */
    const autoResizeTextarea = () => {
        dom.chatInput.style.height = 'auto';
        dom.chatInput.style.height = `${dom.chatInput.scrollHeight}px`;
    };

    // --- Event Listeners ---
    dom.sendBtn.addEventListener('click', handleSendMessage);
    dom.newChatBtn.addEventListener('click', handleNewChat);
    dom.chatInput.addEventListener('input', autoResizeTextarea);
    dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // --- Initial Load ---
    loadApiSettings();
});
