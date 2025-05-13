import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js'; // Use CDN for simplicity

// --- Global Variables ---
let ws;
let currentAiMessageElement = null;
let thinkingIndicatorElement = null;
let currentImageData = null; // Store { base64: string, mimeType: string } for user uploads
let lastToolImageSrc = null; // Store image source from the last tool result

// Configure marked with sanitization (IMPORTANT!)
marked.use({ sanitize: true });

// --- Wait for DOMContentLoaded before initializing UI and listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Get DOM Elements --- 
    const chatLog = document.getElementById('message-list');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const resetButton = document.getElementById('reset-button');
    const statusIndicator = document.getElementById('status-indicator');
    const connectServerButton = document.getElementById('connect-server-button');
    const modal = document.getElementById('connect-server-modal');
    const closeModalButton = modal?.querySelector('.close-button');
    const connectServerForm = document.getElementById('connect-server-form');
    const serverTypeSelect = document.getElementById('server-type');
    const stdioOptionsDiv = document.getElementById('stdio-options');
    const sseOptionsDiv = document.getElementById('sse-options');
    const imageUpload = document.getElementById('image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');

    // --- Check if critical elements exist ---
    if (!chatLog || !messageInput || !sendButton || !resetButton || !statusIndicator || !connectServerButton || !modal || !connectServerForm || !serverTypeSelect || !stdioOptionsDiv || !sseOptionsDiv || !imageUpload || !imagePreviewContainer || !imagePreview || !removeImageBtn) {
        console.error("Initialization failed: One or more required DOM elements not found.");
        // Display error to user if possible
        if (chatLog) {
             const errorElement = document.createElement('div');
             errorElement.classList.add('message', 'system-error'); // Use existing class
             errorElement.textContent = '[System: Critical UI elements failed to load. Please refresh.]';
             chatLog.appendChild(errorElement);
        }
        return; // Stop further execution
    }

    function scrollToBottom() {
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    function displaySystemMessage(text, type = 'info') {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `system-${type}`);
        messageElement.textContent = `[System: ${text}]`;
        chatLog.appendChild(messageElement);
        scrollToBottom();
    }
    
    function appendMessage(sender, text, imageBase64 = null) {
        const messageElement = document.createElement('div');
        // Use the classes targeted by style.css: 'message' and 'user' or 'ai'
        const senderClass = sender === 'user' ? 'user' : 'ai'; // Map 'assistant' or others to 'ai' for styling
        messageElement.classList.add('message', senderClass);
        // messageElement.classList.add('chat-message', `${sender}-message`); // REMOVE old class logic

        const textElement = document.createElement('p');
        textElement.textContent = text;
        messageElement.appendChild(textElement);

        // If it's a user message with an image, display the image
        if (sender === 'user' && imageBase64) {
            const imgElement = document.createElement('img');
            imgElement.src = imageBase64;
            imgElement.alt = "User uploaded image";
            imgElement.classList.add('message-image'); 
            messageElement.appendChild(imgElement); // Add image below text
        }

        chatLog.appendChild(messageElement);
        scrollToBottom();
    }

    function appendExpandableMessage(headerHtml, contentHtml, type) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', type);
        messageElement.innerHTML = headerHtml + contentHtml; 

        messageElement.addEventListener('click', () => {
            messageElement.classList.toggle('expanded');
        });

        chatLog.appendChild(messageElement);
        let shouldScroll = isScrolledToBottom();
        if (shouldScroll) {
            scrollToBottom();
        }
        return messageElement;
    }

    function showThinkingIndicator() {
        let shouldScroll = isScrolledToBottom();
        if (!thinkingIndicatorElement) {
            thinkingIndicatorElement = document.createElement('div');
            thinkingIndicatorElement.classList.add('message', 'ai', 'thinking');
            const innerSpan = document.createElement('span'); 
            thinkingIndicatorElement.appendChild(innerSpan);
            thinkingIndicatorElement.setAttribute('role', 'status');
            thinkingIndicatorElement.setAttribute('aria-live', 'polite');
            chatLog.appendChild(thinkingIndicatorElement);
            if (shouldScroll) {
                scrollToBottom();
            }
        }
    }

    function removeThinkingIndicator() {
        if (thinkingIndicatorElement) {
            thinkingIndicatorElement.remove();
            thinkingIndicatorElement = null;
        }
    }

    function isScrolledToBottom() {
        const threshold = 5;
        return chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight <= threshold;
    }

    function adjustTextareaHeight() {
        messageInput.style.height = 'auto';
        messageInput.style.height = `${messageInput.scrollHeight}px`;

        // Adjust chat log padding based on input area height
        const inputAreaHeight = document.getElementById('input-area').offsetHeight;
        const previewHeight = imagePreviewContainer.style.display === 'none' ? 0 : imagePreviewContainer.offsetHeight + 10; // + margin/padding
        chatLog.style.paddingBottom = `${inputAreaHeight + previewHeight}px`;
    }

    // Modify sendMessage to include image data
    async function sendMessage() {
        const messageText = messageInput.value.trim();

        // Require text input even if image is present
        if (!messageText) {
            // Optionally show a message to the user
            console.log("User input text is required.")
            return;
        } 

        appendMessage('user', messageText, currentImageData ? currentImageData.base64 : null);
        messageInput.value = '';
        messageInput.style.height = 'auto'; // Reset height before sending
        const imageDataToSend = currentImageData; 
        removeImage(); // Clear image after grabbing data for sending

        // Send via WebSocket instead of fetch
        if (ws && ws.readyState === WebSocket.OPEN) {
            const payload = { type: 'message', content: messageText, imageData: imageDataToSend };
            ws.send(JSON.stringify(payload));
            lastToolImageSrc = null; // Clear any stored tool image when user sends a new message
        } else {
            displaySystemMessage('Cannot send message: Not connected to server.', 'error');
        }
    }

    function resetConversation() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('Sending reset request...');
            ws.send(JSON.stringify({ type: 'reset' }));
            // UI clear is handled by 'conversationReset' event from server
        } else {
            displaySystemMessage('Cannot reset: Not connected to server.', 'error');
        }
    }

    // --- WebSocket Handling (Needs access to DOM helpers defined above) ---
    function handleWebSocketMessage(message) {
        removeThinkingIndicator();
        let shouldScroll = isScrolledToBottom();

        switch (message.event) {
            case 'thinking':
                showThinkingIndicator();
                break;
            case 'chunk': {
                if (!currentAiMessageElement) {
                    // Create the container div directly for streaming AI messages
                    currentAiMessageElement = document.createElement('div');
                    // Use the correct base classes targeted by CSS: 'message' and 'ai'
                    currentAiMessageElement.classList.add('message', 'ai'); 
                    currentAiMessageElement.classList.add('streaming'); // Add streaming class if needed
                    chatLog.appendChild(currentAiMessageElement);
                }
                if (currentAiMessageElement) {
                   let currentHtml = currentAiMessageElement.innerHTML || '';
                   // Append the raw chunk text (or parsed text if needed, depends on source)
                   // Assuming message.data.text is the raw delta
                   // We need to parse the *accumulated* text at the end, not each chunk
                   let accumulatedText = (currentAiMessageElement.dataset.rawText || '') + message.data.text;
                   currentAiMessageElement.dataset.rawText = accumulatedText; // Store raw text
                   
                   // Render the parsed version of the *accumulated* text
                   try {
                        currentAiMessageElement.innerHTML = marked.parse(accumulatedText);
                   } catch(e) {
                        console.error("Streaming Markdown parsing error:", e);
                        // Fallback: display escaped text
                        currentAiMessageElement.innerHTML = escapeHtml(accumulatedText).replace(/\n/g, '<br>');
                   }
                }
                break;
            }
            case 'response': {
                 let finalHtmlContent = '';
                 let finalText = message.data.text || ''; // Get the final text
                 
                 // Use the final text if currentAiMessageElement exists (meaning it was streamed)
                 if (currentAiMessageElement && currentAiMessageElement.dataset.rawText) {
                     finalText = currentAiMessageElement.dataset.rawText; // Use accumulated raw text
                 }

                 // --- Add image if available from last tool result ---
                 let imageHtml = '';
                 if (lastToolImageSrc) {
                     imageHtml = `<img src="${escapeHtml(lastToolImageSrc)}" class="message-image" alt="AI generated image"/>`;
                     lastToolImageSrc = null; // Clear after use
                 }
                 // --- End image addition ---

                 try {
                     // Combine parsed text and image HTML
                     finalHtmlContent = marked.parse(finalText) + imageHtml;
                 } catch(e) {
                     console.error("Markdown parsing error:", e);
                     // Fallback: display escaped text and image HTML
                     finalHtmlContent = escapeHtml(finalText).replace(/\n/g, '<br>') + imageHtml;
                 }

                 if (currentAiMessageElement) {
                    currentAiMessageElement.innerHTML = finalHtmlContent; // Set final parsed content
                    currentAiMessageElement.classList.remove('streaming');
                    delete currentAiMessageElement.dataset.rawText; // Clean up dataset
                    currentAiMessageElement = null;
                } else {
                    // If it's a non-streaming response, create the element directly
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('message', 'ai');
                    messageElement.innerHTML = finalHtmlContent; // Set the combined HTML content
                    chatLog.appendChild(messageElement);
                }
                break;
            }
            case 'toolCall':
                appendExpandableMessage(
                    `<p class="tool-call-header">🛠️ <strong>Tool Call:</strong> ${escapeHtml(message.data.toolName)}</p>`,
                    `<pre class="tool-call-args">${escapeHtml(JSON.stringify(message.data.args, null, 2))}</pre>`,
                    'tool-call'
                );
                break;
            case 'toolResult':
                // Check for image data in the tool result
                let resultHtml = '';
                if (message.data.result && message.data.result.image && message.data.result.image.base64) {
                    const { base64, mimeType } = message.data.result.image;
                    lastToolImageSrc = `data:${mimeType};base64,${base64}`;
                    resultHtml = `<p class="tool-result-text">✅ <strong>Tool Result:</strong> ${escapeHtml(message.data.toolName)} (Image displayed with next AI response)</p>`;
                } else if (message.data.result && typeof message.data.result === 'string') {
                    resultHtml = `<p class="tool-result-header">✅ <strong>Tool Result:</strong> ${escapeHtml(message.data.toolName)}</p><pre class="tool-result-output">${escapeHtml(message.data.result)}</pre>`;
                } else {
                    resultHtml = `<p class="tool-result-header">✅ <strong>Tool Result:</strong> ${escapeHtml(message.data.toolName)}</p><pre class="tool-result-output">${escapeHtml(JSON.stringify(message.data.result, null, 2))}</pre>`;
                }
                appendExpandableMessage(resultHtml, '', 'tool-result');
                break;
            case 'error':
                displaySystemMessage(`Server error: ${message.data.message}`, 'error');
                break;
            case 'conversationReset':
                chatLog.innerHTML = ''; // Clear all messages
                currentAiMessageElement = null;
                thinkingIndicatorElement = null;
                lastToolImageSrc = null;
                removeImage(); // Also clear any user-selected image
                displaySystemMessage('Conversation history has been reset.', 'info');
                break;
            default:
                console.warn('Received unknown WebSocket event:', message);
        }
        if (shouldScroll) {
            scrollToBottom();
        }
    }

    // --- Modal Handling ---
    connectServerButton.onclick = () => {
        modal.style.display = "block";
    }
    closeModalButton.onclick = () => {
        modal.style.display = "none";
    }
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
    serverTypeSelect.onchange = () => {
        if (serverTypeSelect.value === 'stdio') {
            stdioOptionsDiv.style.display = 'block';
            sseOptionsDiv.style.display = 'none';
        } else {
            stdioOptionsDiv.style.display = 'none';
            sseOptionsDiv.style.display = 'block';
        }
    };

    connectServerForm.onsubmit = async (event) => {
        event.preventDefault();
        const serverName = document.getElementById('server-name').value;
        const serverType = serverTypeSelect.value;
        let config = {};

        if (serverType === 'stdio') {
            const command = document.getElementById('server-command').value;
            const argsString = document.getElementById('server-args').value;
            const args = argsString ? argsString.split(',').map(arg => arg.trim()) : [];
            config = { type: 'stdio', command, args };
        } else {
            const url = document.getElementById('server-url').value;
            config = { type: 'sse', url };
        }

        try {
            const response = await fetch('/api/connect-server', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: serverName, config }),
            });
            const result = await response.json();
            if (response.ok) {
                displaySystemMessage(`Successfully initiated connection to server '${serverName}'.`, 'success');
            } else {
                displaySystemMessage(`Failed to connect to server '${serverName}': ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            displaySystemMessage(`Error connecting to server '${serverName}': ${error.message}`, 'error');
        }
        modal.style.display = "none";
    };

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => {
            displaySystemMessage('Connected to server.', 'success');
            statusIndicator.classList.remove('disconnected');
            statusIndicator.classList.add('connected');
            statusIndicator.dataset.tooltip = "Connected";
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (e) {
                console.error("Error parsing WebSocket message:", e);
                displaySystemMessage('Received malformed message from server.', 'error');
            }
        };

        ws.onclose = () => {
            displaySystemMessage('Disconnected from server. Attempting to reconnect...', 'warn');
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('disconnected');
            statusIndicator.dataset.tooltip = "Disconnected. Retrying...";
            currentAiMessageElement = null;
            removeThinkingIndicator();
            // Attempt to reconnect after a delay
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            displaySystemMessage('WebSocket connection error.', 'error');
            // ws.onclose will likely be called next, triggering reconnection logic
        };
    }

    // --- Initialize Event Listeners ---
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    messageInput.addEventListener('input', adjustTextareaHeight);
    sendButton.addEventListener('click', sendMessage);
    resetButton.addEventListener('click', resetConversation);
    
    imageUpload.addEventListener('change', handleImageUpload);
    removeImageBtn.addEventListener('click', removeImage);

    // --- Initial Setup ---
    adjustTextareaHeight(); // Initial height adjustment
    connectWebSocket(); // Initial WebSocket connection
    displaySystemMessage('Welcome to Saiki! Type your message below.');
});

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const mimeType = file.type;
            currentImageData = { base64: e.target.result.split(',')[1], mimeType }; // Store base64 and mimeType
            document.getElementById('image-preview').src = e.target.result;
            document.getElementById('image-preview-container').style.display = 'flex';
        }
        reader.readAsDataURL(file);
    }
    // Clear the input value to allow selecting the same file again if removed then re-added
    event.target.value = null;
}

function removeImage() {
    currentImageData = null;
    document.getElementById('image-preview').src = '#';
    document.getElementById('image-preview-container').style.display = 'none';
    // Clear the file input if needed by resetting the form it's in, or by replacing the input element.
    // For simplicity, we just clear the data. If re-uploading the exact same file without change is needed,
    // the input field value for 'image-upload' might need explicit clearing.
    const imageUploadInput = document.getElementById('image-upload');
    if(imageUploadInput) imageUploadInput.value = ''; // Attempt to clear the file input
}

// Utility to escape HTML (basic version)
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
} 