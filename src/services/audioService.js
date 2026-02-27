/**
 * Audio Monitoring Service
 * Uses Web Speech API for keyword detection 
 */

class AudioService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.keywords = [];
        this.onKeywordDetected = null;
        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech Recognition not supported in this browser.');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            // Get the latest result only for immediate word-by-word identification
            const latestIndex = event.results.length - 1;
            const transcript = event.results[latestIndex][0].transcript.toLowerCase();

            this._checkKeywords(transcript);
        };

        this.recognition.onerror = (event) => {
            console.error('Audio Service Error:', event.error);
            if (event.error === 'no-speech') return;
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                try {
                    this.recognition.start();
                } catch (e) { }
            }
        };
    }

    setKeywords(words) {
        const text = words.join(' ').toLowerCase();
        // 1. Extract significant technical words (3+ chars)
        const technicalWords = [...new Set(text.match(/\b\w{3,}\b/g) || [])];

        // 2. Add Global Answer Keywords (1, 2, 3, 4, A, B, C, D, one, two...)
        const globalKeywords = ['a', 'b', 'c', 'd', 'one', 'two', 'three', 'four', '1', '2', '3', '4', 'option', 'answer'];

        this.keywords = [...new Set([...technicalWords, ...globalKeywords])];
        console.log('Audio Guard: Watching for keywords:', this.keywords);
    }

    start() {
        if (!this.recognition || this.isListening) return;
        try {
            this.isListening = true;
            this.recognition.start();
            console.log('Audio Guard Active: Monitoring for technical & answer-related keywords.');
        } catch (e) {
            console.error('Audio Start Error:', e);
        }
    }

    stop() {
        this.isListening = false;
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) { }
        }
    }

    _checkKeywords(text) {
        if (!text || this.keywords.length === 0) return;

        // Use Word Boundaries to prevent partial matches like 'a' in 'answer'
        const detected = this.keywords.filter(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(text);
        });

        if (detected.length > 0) {
            detected.forEach(word => {
                if (this.onKeywordDetected) {
                    this.onKeywordDetected(word);
                }
            });
        }
    }
}

export const audioService = new AudioService();
