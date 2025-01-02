class SummarizeMe {
  constructor() {
    this.cache = new Map();
    this.currentText = '';
    this.currentLanguage = null;
    this.currentSummary = null;
    this.isTranslated = false;
    this.boundHandleSummarize = this.handleSummarize.bind(this);
    this.boundHandleTranslate = this.handleTranslate.bind(this);
    this.init();
  }

  async init() {
    this.bindElements();
    this.bindEvents();
    await this.extractContent();
    this.modeSwitches.classList.add('hidden');
    this.summarySection.classList.add('hidden');
  }

  bindElements() {
    this.summarizeBtn = document.getElementById('summarizeBtn');
    this.pageTitle = document.getElementById('pageTitle');
    this.extractedText = document.getElementById('extractedText');
    this.summaryText = document.getElementById('summaryText');
    this.loadingExtract = document.getElementById('loadingExtract');
    this.loadingSummary = document.getElementById('loadingSummary');
    this.modeInputs = document.querySelectorAll('input[name="mode"]');
    this.modeSwitches = document.querySelector('.mode-switches');
    this.summarySection = document.querySelector('.summary-section');
    this.extractedContent = document.getElementById('extractedContent');
    this.loadingMessage = document.getElementById('loadingMessage');
  }

  bindEvents() {
    this.summarizeBtn.addEventListener('click', this.boundHandleSummarize);
    this.modeInputs.forEach(input => {
      input.addEventListener('change', (e) => this.handleModeChange(e.target.value));
    });
  }

  async extractContent() {
    try {
      this.loadingExtract.classList.remove('hidden');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['readability.js']
      });

      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          try {
            if (!document.body) return null;
            
            const documentClone = document.cloneNode(true);
            const reader = new Readability(documentClone);
            const article = reader.parse();
            
            return article ? { 
              title: article.title,
              content: article.textContent
            } : null;
          } catch (e) {
            console.error('Readability error:', e);
            return null;
          }
        }
      });

      const article = result[0].result;
      if (!article) {
        throw new Error('Could not extract content from this page');
      }

      if (!article.content || article.content.trim().length < 50) {
        throw new Error('Extracted content is too short or empty');
      }

      this.pageTitle.textContent = article.title || 'Untitled';
      this.extractedText.textContent = article.content;
      this.currentText = article.content;

      console.log('Extracted content:', {
        title: article.title,
        contentLength: article.content.length,
        firstFewChars: article.content.substring(0, 100) + '...'
      });

    } catch (error) {
      console.error('Extraction error:', error);
      this.showError('Failed to extract content: ' + error.message);
    } finally {
      this.loadingExtract.classList.add('hidden');
    }
  }

  async handleSummarize() {
    this.summarizeBtn.classList.add('hidden');
    
    this.modeSwitches.classList.remove('hidden');
    this.summarySection.classList.remove('hidden');
    this.extractedContent.classList.add('hidden');
    
    const currentMode = document.querySelector('input[name="mode"]:checked').value;
    await this.getSummary(currentMode);
  }

  async handleModeChange(mode) {
    if (this.isTranslated) {
      this.isTranslated = false;
      this.setupTranslateButton();
    }
    
    if (this.cache.has(mode)) {
      this.summaryText.innerHTML = this.cache.get(mode);
      this.currentSummary = this.summaryText.textContent;
      
      const isChinese = /[\u4e00-\u9fa5]/.test(this.currentSummary);
      if (!isChinese && !this.isTranslated) {
        this.setupTranslateButton();
      }
    } else {
      await this.getSummary(mode);
    }
  }

  setupTranslateButton() {
    this.summarizeBtn.removeEventListener('click', this.boundHandleSummarize);
    this.summarizeBtn.removeEventListener('click', this.boundHandleTranslate);
    
    this.summarizeBtn.textContent = 'Translate';
    this.summarizeBtn.classList.remove('hidden');
    this.summarizeBtn.addEventListener('click', this.boundHandleTranslate);
  }

  async getSummary(level) {
    if (!this.currentText) {
      this.showError('No content to summarize');
      return;
    }

    try {
      this.loadingSummary.classList.remove('hidden');
      this.loadingMessage.textContent = 'Generating summary...';
      this.summaryText.innerHTML = '';
      this.isTranslated = false;

      const truncatedText = this.truncateText(this.currentText);
      const payload = {
        text: truncatedText,
        level: level
      };

      const response = await fetch('https://writingtools-hk-jgvsuzcgqo.cn-hongkong.fcapp.run/summarizeWebpage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      let summaryText;
      if (typeof data === 'string') {
        summaryText = data;
      } else if (data.data && data.data.res) {
        summaryText = data.data.res;
      } else if (data.code === 0 && typeof data.data === 'string') {
        summaryText = data.data;
      } else {
        throw new Error('Invalid response format from API');
      }

      if (!summaryText || typeof summaryText !== 'string') {
        throw new Error('No valid summary text received');
      }

      this.currentSummary = summaryText;
      const summary = level === 'points' 
        ? `<ul>${this.formatBulletPoints(summaryText)}</ul>`
        : `<p>${summaryText}</p>`;

      this.cache.set(level, summary);
      this.summaryText.innerHTML = summary;

      const isChinese = /[\u4e00-\u9fa5]/.test(summaryText);
      if (!isChinese) {
        this.setupTranslateButton();
      } else {
        this.summarizeBtn.classList.add('hidden');
      }

    } catch (error) {
      console.error('Summary error:', error);
      this.showError('Failed to generate summary: ' + error.message);
      this.summarizeBtn.classList.remove('hidden');
    } finally {
      this.loadingSummary.classList.add('hidden');
    }
  }

  async handleTranslate() {
    const currentText = this.currentSummary;
    if (!currentText) {
      this.showError('No content to translate');
      return;
    }

    try {
      this.loadingSummary.classList.remove('hidden');
      this.loadingMessage.textContent = 'Translating to Simplified Chinese...';
      this.summarizeBtn.classList.add('hidden');

      const response = await fetch('https://writingtools-hk-jgvsuzcgqo.cn-hongkong.fcapp.run/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: currentText
        })
      });

      const data = await response.json();
      
      if (!data.translationCN) {
        throw new Error('No translation received');
      }

      const currentMode = document.querySelector('input[name="mode"]:checked').value;
      const translatedSummary = currentMode === 'points' 
        ? `<ul>${this.formatBulletPoints(data.translationCN)}</ul>`
        : `<p>${data.translationCN}</p>`;

      this.summaryText.innerHTML = translatedSummary;
      this.isTranslated = true;
      this.cache.set(`${currentMode}_translated`, translatedSummary);
      this.currentSummary = data.translationCN;

    } catch (error) {
      console.error('Translation error:', error);
      this.showError('Failed to translate: ' + error.message);
      this.summarizeBtn.classList.remove('hidden');
    } finally {
      this.loadingSummary.classList.add('hidden');
    }
  }

  formatBulletPoints(text) {
    return text.split('\n')
      .filter(point => point.trim())
      .map(point => {
        point = point.trim().replace(/^[\-\.\*]\s*/, '');
        return `<li>${point}</li>`;
      })
      .join('');
  }

  showError(message) {
    this.summaryText.innerHTML = `<div class="error">${message}</div>`;
  }

  truncateText(text, maxLength = 5000) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SummarizeMe();
}); 