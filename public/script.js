// ===================================================================
// SMART ASSISTANT AI WORKFLOW - PRODUCTION JAVASCRIPT ENGINE
// Calls real /api/generate endpoint instead of mocking responses
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const templateSelect = document.getElementById('templateSelect');
  const dynamicInputs = document.getElementById('dynamicInputs');
  const generateBtn = document.getElementById('generateBtn');
  const responseFeed = document.getElementById('responseFeed');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const temperatureRange = document.getElementById('temperatureRange');
  const tempValue = document.getElementById('tempValue');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const clearFeedBtn = document.getElementById('clearFeedBtn');
  const toastContainer = document.getElementById('toastContainer');
  const pillButtons = document.querySelectorAll('.pill-btn');

  // State Variables
  let cardFeedData = [];
  let currentTemplateKey = '';
  let activeFilter = 'all';
  let isGenerating = false;

  // Templates Registry
  const TEMPLATES = {
    email: {
      id: 'email',
      title: 'Email Generator',
      templateStr: "Write a {Tone} email to {Audience} about {Topic}.",
      fields: [
        { name: 'Tone', type: 'select', options: ['Professional', 'Casual', 'Persuasive', 'Urgent', 'Friendly'] },
        { name: 'Audience', type: 'text', placeholder: 'e.g. Executive Team, Client, Marketing List' },
        { name: 'Topic', type: 'textarea', placeholder: 'e.g. Q3 Performance Review and strategic pivot plans...' }
      ]
    },
    explainer: {
      id: 'explainer',
      title: 'Expert Explainer',
      templateStr: "Act as a {Role} expert and explain {Concept} in simple terms.",
      fields: [
        { name: 'Role', type: 'text', placeholder: 'e.g. Quantum Physicist, Senior Software Architect' },
        { name: 'Concept', type: 'textarea', placeholder: 'e.g. Neural Networks, Zero-Knowledge Proofs' }
      ]
    },
    strategy: {
      id: 'strategy',
      title: 'Strategy Creator',
      templateStr: "Create a comprehensive strategy for {Target Audience} focused on {Topic}.",
      fields: [
        { name: 'Target Audience', type: 'text', placeholder: 'e.g. Early-stage Founders, Enterprise Sales' },
        { name: 'Topic', type: 'textarea', placeholder: 'e.g. B2B SaaS Product Growth & Customer Retention' }
      ]
    },
    code_review: {
      id: 'code_review',
      title: 'Code Reviewer & Auditor',
      templateStr: "Review the following {Language} snippet for {Focus_Area}:\n\n{Code}",
      fields: [
        { name: 'Language', type: 'select', options: ['JavaScript / React', 'Python', 'Go', 'Rust', 'TypeScript'] },
        { name: 'Focus_Area', type: 'select', options: ['Security & Bugs', 'Performance & Speed', 'Readability & Clean Code'] },
        { name: 'Code', type: 'textarea', placeholder: 'Paste code snippet here...' }
      ]
    },
    social_media: {
      id: 'social_media',
      title: 'Social Media Copywriter',
      templateStr: "Craft 3 engaging {Platform} posts about {Topic} with a {Style} tone.",
      fields: [
        { name: 'Platform', type: 'select', options: ['LinkedIn', 'Twitter / X', 'Instagram', 'Product Hunt'] },
        { name: 'Style', type: 'select', options: ['Thought Leadership', 'Storytelling', 'Punchy & Viral', 'Educational'] },
        { name: 'Topic', type: 'text', placeholder: 'e.g. Launching an open-source AI developer tool' }
      ]
    }
  };

  // ===================================================================
  // THEME TOGGLE
  // ===================================================================
  themeToggleBtn.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const icon = themeToggleBtn.querySelector('i');
    icon.className = newTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    
    showToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'info');
  });

  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // ===================================================================
  // TEMPLATE SELECTION & DYNAMIC INPUTS
  // ===================================================================
  templateSelect.addEventListener('change', (e) => {
    currentTemplateKey = e.target.value;
    renderDynamicInputs();
    checkFormCompletion();
  });

  function renderDynamicInputs() {
    dynamicInputs.innerHTML = '';

    if (!currentTemplateKey || !TEMPLATES[currentTemplateKey]) {
      dynamicInputs.innerHTML = `
        <div class="empty-dynamic-notice">
          <i class="fa-solid fa-hand-pointer"></i>
          Select a workflow template above to dynamically populate input variables.
        </div>
      `;
      return;
    }

    const template = TEMPLATES[currentTemplateKey];
    template.fields.forEach(field => {
      const fieldGroup = document.createElement('div');
      fieldGroup.className = 'form-group';

      const label = document.createElement('label');
      label.textContent = field.name;
      label.htmlFor = `field-${field.name}`;

      let input;
      if (field.type === 'select') {
        input = document.createElement('select');
        input.id = `field-${field.name}`;
        input.dataset.fieldName = field.name;
        field.options.forEach(option => {
          const opt = document.createElement('option');
          opt.value = option;
          opt.textContent = option;
          input.appendChild(opt);
        });
      } else if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.id = `field-${field.name}`;
        input.placeholder = field.placeholder;
        input.dataset.fieldName = field.name;
        input.rows = 3;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.id = `field-${field.name}`;
        input.placeholder = field.placeholder;
        input.dataset.fieldName = field.name;
      }

      input.addEventListener('input', checkFormCompletion);
      fieldGroup.appendChild(label);
      fieldGroup.appendChild(input);
      dynamicInputs.appendChild(fieldGroup);
    });
  }

  function checkFormCompletion() {
    const inputs = dynamicInputs.querySelectorAll('input[type="text"], textarea, select');
    const allFilled = Array.from(inputs).every(input => input.value.trim() !== '');
    generateBtn.disabled = !currentTemplateKey || !allFilled || isGenerating;
  }

  // ===================================================================
  // TEMPERATURE SLIDER
  // ===================================================================
  temperatureRange.addEventListener('input', (e) => {
    tempValue.textContent = parseFloat(e.target.value).toFixed(1);
  });

  // ===================================================================
  // GENERATE AI RESPONSE (REAL API CALL)
  // ===================================================================
  generateBtn.addEventListener('click', async () => {
    if (isGenerating) return;

    const template = TEMPLATES[currentTemplateKey];
    let compiledPrompt = template.templateStr;

    // Replace placeholders with input values
    const inputs = dynamicInputs.querySelectorAll('input[type="text"], textarea, select');
    inputs.forEach(input => {
      const fieldName = input.dataset.fieldName;
      const value = input.value.trim();
      compiledPrompt = compiledPrompt.replace(`{${fieldName}}`, value);
    });

    // Create card placeholder
    const cardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const cardData = {
      id: cardId,
      templateKey: currentTemplateKey,
      templateTitle: template.title,
      prompt: compiledPrompt,
      temperature: parseFloat(temperatureRange.value).toFixed(1),
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      bookmarked: false,
      aiResponse: null,
      isLoading: true
    };

    cardFeedData.unshift(cardData);
    renderFeed();

    // Set generating state
    isGenerating = true;
    generateBtn.disabled = true;

    try {
      // Call backend API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: compiledPrompt,
          temperature: cardData.temperature
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate response');
      }

      // Update card with response
      cardData.aiResponse = data.result;
      cardData.isLoading = false;

      renderFeed();
      showToast('✨ AI Response Generated!', 'success');

    } catch (error) {
      console.error('API Error:', error);

      // Update card with error
      cardData.aiResponse = `❌ Error: ${error.message}`;
      cardData.isLoading = false;

      renderFeed();
      showToast(`Error: ${error.message}`, 'warning');

    } finally {
      isGenerating = false;
      checkFormCompletion();
    }
  });

  // ===================================================================
  // RENDER FEED WITH SEARCH & FILTER
  // ===================================================================
  function renderFeed() {
    const searchTerm = searchInput.value.toLowerCase();

    const filtered = cardFeedData.filter(card => {
      const matchesFilter = activeFilter === 'all'
        ? true
        : activeFilter === 'saved'
          ? card.bookmarked
          : card.templateKey === activeFilter;

      const responseText = card.aiResponse || '';
      const matchesSearch =
        card.prompt.toLowerCase().includes(searchTerm) ||
        responseText.toLowerCase().includes(searchTerm) ||
        card.templateTitle.toLowerCase().includes(searchTerm);

      return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      responseFeed.innerHTML = '';
      responseFeed.appendChild(emptyState);
      return;
    }

    emptyState.style.display = 'none';
    responseFeed.innerHTML = '';

    filtered.forEach(card => {
      const cardElem = document.createElement('div');
      cardElem.className = 'card';
      cardElem.dataset.id = card.id;

      const responseContent = card.isLoading
        ? '<div style="text-align: center; padding: 1rem;"><i class="fa-solid fa-spinner fa-spin" style="color: var(--brand-primary); font-size: 1.5rem;"></i><p style="margin-top: 0.5rem; color: var(--text-secondary);">Generating response...</p></div>'
        : `<div class="ai-response">${formatMarkdown(card.aiResponse)}</div>`;

      cardElem.innerHTML = `
        <div class="card-header">
          <div class="card-title">
            <i class="fa-solid fa-robot"></i>
            ${escapeHtml(card.templateTitle)}
            <span class="card-meta">Temp: ${card.temperature} • ${card.timestamp}</span>
          </div>
          <div class="card-actions">
            <button class="icon-btn bookmark-btn ${card.bookmarked ? 'active' : ''}" title="Bookmark Card" ${card.isLoading ? 'disabled' : ''}>
              <i class="${card.bookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
            </button>
            <button class="icon-btn copy-btn" title="Copy Response" ${card.isLoading ? 'disabled' : ''}>
              <i class="fa-regular fa-copy"></i>
            </button>
            <button class="icon-btn delete-btn" title="Delete Card">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="card-body">
          <div class="prompt-box">
            <div class="prompt-label"><i class="fa-solid fa-terminal"></i> Compiled Prompt:</div>
            ${escapeHtml(card.prompt)}
          </div>

          ${responseContent}
        </div>
      `;

      // Action Handlers
      const bookmarkBtn = cardElem.querySelector('.bookmark-btn');
      if (!card.isLoading) {
        bookmarkBtn.addEventListener('click', () => {
          card.bookmarked = !card.bookmarked;
          renderFeed();
          showToast(card.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks', 'info');
        });
      }

      const copyBtn = cardElem.querySelector('.copy-btn');
      if (!card.isLoading) {
        copyBtn.addEventListener('click', () => {
          copyToClipboard(card.aiResponse);
          showToast('Copied to clipboard!', 'success');
        });
      }

      const deleteBtn = cardElem.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', () => {
        cardFeedData = cardFeedData.filter(c => c.id !== card.id);
        renderFeed();
        showToast('Card removed', 'info');
      });

      responseFeed.appendChild(cardElem);
    });
  }

  // ===================================================================
  // UTILITY FUNCTIONS
  // ===================================================================
  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatMarkdown(text) {
    if (!text) return '';
    return escapeHtml(text)
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ===================================================================
  // TOAST NOTIFICATIONS
  // ===================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ===================================================================
  // FILTER BUTTONS
  // ===================================================================
  pillButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      pillButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderFeed();
    });
  });

  // ===================================================================
  // SEARCH INPUT
  // ===================================================================
  searchInput.addEventListener('input', renderFeed);

  // ===================================================================
  // CLEAR FEED
  // ===================================================================
  clearFeedBtn.addEventListener('click', () => {
    if (cardFeedData.length === 0) {
      showToast('Workspace is already empty', 'info');
      return;
    }
    if (confirm('Clear all generated cards from workspace? This action cannot be undone.')) {
      cardFeedData = [];
      renderFeed();
      showToast('Workspace cleared', 'info');
    }
  });
});
