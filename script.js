/**
 * Certificate Generator Logic
 */

// Secret code for accessing the generator (admin can change this)
const SECRET_CODE = "CERTIGEN-MEC";
// Admin WhatsApp Number (Format: Country Code + Number, no '+' or spaces)
const ADMIN_WHATSAPP = "919443656854"; // REPLACE THIS WITH YOUR NUMBER

class CertificateApp {
    constructor() {
        this.canvas = document.getElementById('certificateCanvas');
        this.ctx = this.canvas.getContext('2d');

        // State
        this.currentTemplateImg = null;
        this.csvData = [];
        this.currentCSVIndex = -1;

        // Configuration for multiple elements
        this.elements = {
            name: {
                text: '', // Start empty as requested
                fontFamily: "'Great Vibes', cursive",
                fontSize: 60,
                color: '#333333',
                x: 0,
                y: 0,
                visible: true
            },
            date: {
                text: '',
                fontFamily: "'Roboto', sans-serif",
                fontSize: 24,
                color: '#333333',
                x: 0,
                y: 0,
                visible: true
            },
            signature: {
                text: '',
                image: null, // Stores the drawn signature image
                fontFamily: "'Great Vibes', cursive",
                fontSize: 40,
                color: '#333333',
                x: 0,
                y: 0,
                visible: true
            },
            signatureLabel: {
                text: 'Authorized Signatory', x: 0, y: 0, fontSize: 18, fontFamily: 'Inter', color: '#000000', visible: true
            }
        };

        this.eraserHistory = [];
        this.activeElementKey = 'name'; // 'name', 'date', or 'signature'
        this.isDragging = false;
        this.snapThreshold = 20; // Pixels threshold for snapping to center

        this.init();
    }

    init() {
        // Load default template from embedded data
        const defaultThumb = document.querySelector('.template-thumb.selected');
        if (defaultThumb) {
            const templateName = defaultThumb.dataset.src.split('/').pop(); // get filename
            if (typeof CERTIFICATE_TEMPLATES !== 'undefined' && CERTIFICATE_TEMPLATES[templateName]) {
                this.loadTemplate(CERTIFICATE_TEMPLATES[templateName]);
            } else {
                // Fallback for custom uploads or if JS file missing
                this.loadTemplate(defaultThumb.dataset.src);
            }
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Template Selection
        document.querySelectorAll('.template-thumb').forEach(thumb => {
            thumb.addEventListener('click', (e) => {
                document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('selected'));
                e.target.classList.add('selected');

                const src = e.target.dataset.src;
                const templateName = src.split('/').pop();

                if (typeof CERTIFICATE_TEMPLATES !== 'undefined' && CERTIFICATE_TEMPLATES[templateName]) {
                    this.loadTemplate(CERTIFICATE_TEMPLATES[templateName]);
                } else {
                    this.loadTemplate(src);
                }

                // Hide remove button since we picked a default
                const removeBtn = document.getElementById('removeTemplate');
                if (removeBtn) removeBtn.classList.add('hidden');
                this.eraserHistory = [];
            });
        });

        // Template Upload
        document.getElementById('templateUpload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    // Open Crop Modal instead of loading right away
                    this.openCropModal(event.target.result);
                };
                reader.readAsDataURL(file);
            }
            // Reset input so the same file can be selected again if needed
            e.target.value = '';
        });

        // Remove Template
        const removeTemplateBtn = document.getElementById('removeTemplate');
        if (removeTemplateBtn) {
            removeTemplateBtn.addEventListener('click', () => {
                document.getElementById('templateUpload').value = ''; // Reset file input
                removeTemplateBtn.classList.add('hidden');

                // Revert to first template
                const firstThumb = document.querySelector('.template-thumb');
                if (firstThumb) firstThumb.click();
            });
        }

        // CSV Upload & Clear
        document.getElementById('csvUpload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.parseCSV(file);
            }
        });

        document.getElementById('removeCsv').addEventListener('click', () => this.removeCSVData());

        // Element Selector Radio Buttons
        document.querySelectorAll('input[name="activeElement"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.setActiveElement(e.target.value);
            });
        });

        // Specific Text Inputs
        const studentNameInput = document.getElementById('studentNameInput');
        studentNameInput.addEventListener('input', (e) => {
            this.elements.name.text = e.target.value;
            this.draw();
        });
        studentNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addNameManually();
            }
        });

        document.getElementById('dateInput').addEventListener('input', (e) => {
            this.elements.date.text = e.target.value;
            this.draw();
        });

        document.getElementById('signatureInput').addEventListener('input', (e) => {
            this.elements.signature.text = e.target.value;
            this.draw();
        });

        document.getElementById('signatureLabelInput').addEventListener('input', (e) => {
            this.elements.signatureLabel.text = e.target.value;
            this.draw();
        });

        // Visibility Toggles
        ['name', 'date', 'signature', 'signatureLabel'].forEach(key => {
            const checkbox = document.getElementById(`${key}Visible`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.elements[key].visible = e.target.checked;
                    this.draw();
                });
            }
        });

        // Common Styling Controls (updates active element)
        ['fontFamily', 'fontSize', 'fontColor', 'posX', 'posY'].forEach(id => {
            document.getElementById(id).addEventListener('input', (e) => {
                this.updateActiveElementFromInputs();
                // Wait for potential font load before drawing
                if (id === 'fontFamily') {
                    document.fonts.ready.then(() => this.draw());
                } else {
                    this.draw();
                }
            });
        });

        // Canvas Interaction (Drag & Drop)
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.isDragging = false);
        this.canvas.addEventListener('mouseout', () => this.isDragging = false);

        // Touch support for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('touchend', () => this.isDragging = false);

        // Downloads
        document.getElementById('downloadOne').addEventListener('click', () => this.downloadSinglePNG());
        document.getElementById('downloadPDF').addEventListener('click', () => this.downloadSinglePDF());
        document.getElementById('downloadZip').addEventListener('click', () => this.generateBulkZip());
        document.getElementById('downloadBulkPDF').addEventListener('click', () => this.generateBulkPDF());

        // Name Navigation
        document.getElementById('prevName').addEventListener('click', () => this.navigateName(-1));
        document.getElementById('nextName').addEventListener('click', () => this.navigateName(1));

        const addNameBtn = document.getElementById('addNameBtn');
        if (addNameBtn) addNameBtn.addEventListener('click', () => this.addNameManually());

        const clearNameBtn = document.getElementById('clearNameBtn');
        if (clearNameBtn) clearNameBtn.addEventListener('click', () => {
            if (this.currentCSVIndex !== -1 && this.currentCSVIndex < this.csvData.length) {
                // If a name from the list is active, remove it
                this.removeNameAtIndex(this.currentCSVIndex);
            } else {
                // Otherwise just clear input
                document.getElementById('studentNameInput').value = '';
                this.elements.name.text = '';
                this.draw();
            }
            document.getElementById('studentNameInput').focus();
        });

        // Preview Arrow Navigation
        const prevCertBtn = document.getElementById('prevCertBtn');
        const nextCertBtn = document.getElementById('nextCertBtn');
        if (prevCertBtn) prevCertBtn.addEventListener('click', () => this.navigateName(-1));
        if (nextCertBtn) nextCertBtn.addEventListener('click', () => this.navigateName(1));

        // Signature Pad Logic
        this.setupSignaturePad();

        // Cropper Logic Setup
        this.setupCropper();

        // Signature Upload Logic
        this.setupSignatureUpload();

        // Erase Tool Logic
        this.setupEraseTool();

        // Template Builder Logic
        this.setupTemplateBuilder();
    }

    setupSignatureUpload() {
        const uploadInput = document.getElementById('uploadSignatureInput');
        if (!uploadInput) return;

        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        this.processSignatureImage(img);
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
            // Reset input
            e.target.value = '';
        });
    }

    processSignatureImage(img) {
        // Create a temporary canvas to process the image
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });

        // Optionally resize very large images to improve performance
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
            height = Math.floor(height * (MAX_WIDTH / width));
            width = MAX_WIDTH;
        }

        tempCanvas.width = width;
        tempCanvas.height = height;

        // Draw original
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Improved signature extraction using grayscale and anti-aliasing
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Convert to grayscale for consistent ink detection
            const gray = (r * 0.299 + g * 0.587 + b * 0.114);

            // Thresholds
            // If it's very light (e.g. > 200), it's background -> fully transparent.
            // If it's very dark (e.g. < 100), it's ink -> fully opaque.
            // Between 100 and 200, scale the alpha for smooth edges (anti-aliasing).

            const whiteThreshold = 200;
            const blackThreshold = 100;

            if (gray >= whiteThreshold) {
                // Background
                data[i + 3] = 0; // Fully transparent
            } else if (gray <= blackThreshold) {
                // Core signature ink
                // Make the ink uniformly dark for a clean look, e.g., dark blue/black
                data[i] = 10;
                data[i + 1] = 10;
                data[i + 2] = 30;
                data[i + 3] = 255;
            } else {
                // Edge of the stroke
                // Alpha scales from 255 (at blackThreshold) to 0 (at whiteThreshold)
                const alpha = Math.floor(255 * (1 - (gray - blackThreshold) / (whiteThreshold - blackThreshold)));
                data[i] = 10;
                data[i + 1] = 10;
                data[i + 2] = 30;
                data[i + 3] = alpha;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Save as the signature image
        const processedImg = new Image();
        processedImg.onload = () => {
            this.elements.signature.image = processedImg;
            this.draw();
            document.getElementById('removeSignatureImg').classList.remove('hidden');
            document.getElementById('signatureInput').disabled = true; // Disable text input
        };
        processedImg.src = tempCanvas.toDataURL('image/png');
    }

    setupEraseTool() {
        const modal = document.getElementById('templateEraseModal');
        const openBtn = document.getElementById('eraseTemplateBtn');
        const canvas = document.getElementById('templateEraseCanvas');
        if (!modal || !openBtn || !canvas) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;
        let currentPath = null;

        const redrawEraserCanvas = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (this.currentTemplateImg) {
                ctx.drawImage(this.currentTemplateImg, 0, 0, canvas.width, canvas.height);
            }
            if (this.eraserHistory) {
                this.eraserHistory.forEach(path => {
                    if (path.points.length === 0) return;
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.beginPath();
                    ctx.strokeStyle = path.color;
                    ctx.lineWidth = path.pSize * canvas.width;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.moveTo(path.points[0].px * canvas.width, path.points[0].py * canvas.height);
                    for (let i = 1; i < path.points.length; i++) {
                        ctx.lineTo(path.points[i].px * canvas.width, path.points[i].py * canvas.height);
                    }
                    ctx.stroke();
                });
            }
        };

        openBtn.addEventListener('click', () => {
            if (!this.currentTemplateImg) {
                alert("Please load a template first.");
                return;
            }
            modal.classList.remove('hidden');

            const maxWidth = 750;
            let width = this.currentTemplateImg.width;
            let height = this.currentTemplateImg.height;

            if (width > maxWidth) {
                height = Math.floor(height * (maxWidth / width));
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            if (!this.eraserHistory) this.eraserHistory = [];
            redrawEraserCanvas();
        });

        document.getElementById('cancelEraseEdit').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        document.getElementById('clearEraseEdits').addEventListener('click', () => {
            this.eraserHistory = [];
            redrawEraserCanvas();
        });

        const undoBtn = document.getElementById('undoEraseBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (this.eraserHistory && this.eraserHistory.length > 0) {
                    this.eraserHistory.pop();
                    redrawEraserCanvas();
                }
            });
        }

        const getScale = () => {
            const rect = canvas.getBoundingClientRect();
            return { x: canvas.width / rect.width, y: canvas.height / rect.height };
        };

        const getClientPos = (e) => {
            if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        };

        const startDrawing = (e) => {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            const scale = getScale();
            const clientPos = getClientPos(e);

            const x = (clientPos.x - rect.left) * scale.x;
            const y = (clientPos.y - rect.top) * scale.y;

            const px = x / canvas.width;
            const py = y / canvas.height;
            const pSize = document.getElementById('eraseBrushSize').value / canvas.width;
            const color = document.getElementById('eraseBrushColor').value;

            currentPath = { color, pSize, points: [{ px, py }] };
            if (!this.eraserHistory) this.eraserHistory = [];
            this.eraserHistory.push(currentPath);

            lastX = x;
            lastY = y;

            drawErase(e);
            if (e.cancelable) e.preventDefault();
        };

        const drawErase = (e) => {
            if (!isDrawing || !currentPath) return;
            const rect = canvas.getBoundingClientRect();
            const scale = getScale();
            const clientPos = getClientPos(e);

            const x = (clientPos.x - rect.left) * scale.x;
            const y = (clientPos.y - rect.top) * scale.y;

            currentPath.points.push({ px: x / canvas.width, py: y / canvas.height });

            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath();
            ctx.strokeStyle = currentPath.color;
            ctx.lineWidth = currentPath.pSize * canvas.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.stroke();

            lastX = x;
            lastY = y;
        };

        const stopDrawing = () => {
            isDrawing = false;
            currentPath = null;
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', drawErase);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', drawErase, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);

        document.getElementById('saveEraseEdit').addEventListener('click', () => {
            // Apply eraser edits virtually via draw function, perfectly bypassing tainted canvas limitations
            this.draw();

            document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('selected'));
            const removeBtn = document.getElementById('removeTemplate');
            if (removeBtn) removeBtn.classList.remove('hidden');

            modal.classList.add('hidden');
        });
    }

    setupTemplateBuilder() {
        const modal = document.getElementById('templateBuilderModal');
        const openBtn = document.getElementById('createTemplateBtn');
        const canvas = document.getElementById('builderCanvas');
        if (!modal || !openBtn || !canvas) return;

        const ctx = canvas.getContext('2d');
        const bgColorInput = document.getElementById('builderBgColor');
        const borderSelect = document.getElementById('builderBorder');
        const borderColorInput = document.getElementById('builderBorderColor');
        const badgeSelect = document.getElementById('builderBadge');

        // New elements
        const headerInput = document.getElementById('builderHeader') || { value: '' };
        const subtitleInput = document.getElementById('builderSubtitle') || { value: '' };
        const descriptionInput = document.getElementById('builderDescription') || { value: '' };
        const centerGraphicSelect = document.getElementById('builderCenterGraphic') || { value: 'none' };
        const linesSelect = document.getElementById('builderLines') || { value: 'none' };

        // Helper for wrapping text
        const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
            const words = text.split(' ');
            let line = '';
            let currentY = y;

            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = context.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && n > 0) {
                    context.fillText(line, x, currentY);
                    line = words[n] + ' ';
                    currentY += lineHeight;
                }
                else {
                    line = testLine;
                }
            }
            context.fillText(line, x, currentY);
            return currentY + lineHeight;
        };

        const drawBuilderCanvas = () => {
            const w = canvas.width;
            const h = canvas.height;

            // 1. Background
            ctx.fillStyle = bgColorInput.value;
            ctx.fillRect(0, 0, w, h);

            // 2. Border
            const borderStyle = borderSelect.value;
            const bColor = borderColorInput.value;

            ctx.strokeStyle = bColor;

            if (borderStyle === 'solid') {
                ctx.lineWidth = 20;
                ctx.strokeRect(40, 40, w - 80, h - 80);
            } else if (borderStyle === 'double') {
                ctx.lineWidth = 15;
                ctx.strokeRect(30, 30, w - 60, h - 60);
                ctx.lineWidth = 5;
                ctx.strokeRect(55, 55, w - 110, h - 110);
            } else if (borderStyle === 'gold-ornate') {
                // Procedurally drawn ornate-ish border
                ctx.lineWidth = 25;
                const grad = ctx.createLinearGradient(0, 0, w, h);
                grad.addColorStop(0, '#BF953F');
                grad.addColorStop(0.25, '#FCF6BA');
                grad.addColorStop(0.5, '#b38728');
                grad.addColorStop(0.75, '#FBF5B7');
                grad.addColorStop(1, '#AA771C');
                ctx.strokeStyle = grad;
                ctx.strokeRect(40, 40, w - 80, h - 80);

                // corner accents
                ctx.fillStyle = grad;
                ctx.fillRect(20, 20, 60, 60);
                ctx.fillRect(w - 80, 20, 60, 60);
                ctx.fillRect(20, h - 80, 60, 60);
                ctx.fillRect(w - 80, h - 80, 60, 60);
            } else if (borderStyle === 'corner-accents') {
                ctx.lineWidth = 4;
                ctx.strokeStyle = bColor;
                ctx.strokeRect(50, 50, w - 100, h - 100);

                // Add angled corners
                const cSize = 40;
                ctx.lineWidth = 8;
                ctx.beginPath();
                // TL
                ctx.moveTo(30, 30 + cSize); ctx.lineTo(30, 30); ctx.lineTo(30 + cSize, 30);
                // TR
                ctx.moveTo(w - 30 - cSize, 30); ctx.lineTo(w - 30, 30); ctx.lineTo(w - 30, 30 + cSize);
                // BL
                ctx.moveTo(30, h - 30 - cSize); ctx.lineTo(30, h - 30); ctx.lineTo(30 + cSize, h - 30);
                // BR
                ctx.moveTo(w - 30 - cSize, h - 30); ctx.lineTo(w - 30, h - 30); ctx.lineTo(w - 30, h - 30 - cSize);
                ctx.stroke();
            } else if (borderStyle === 'elegant-frame') {
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#555';
                ctx.strokeRect(60, 60, w - 120, h - 120);
                ctx.lineWidth = 1;
                ctx.strokeRect(70, 70, w - 140, h - 140);

                ctx.fillStyle = bColor;
                ctx.fillRect(0, 0, w, 20); // Top bar
                ctx.fillRect(0, h - 20, w, 20); // Bottom bar
            }

            // 3. Badge/Ribbon
            const badgeStyle = badgeSelect.value;
            if (badgeStyle === 'gold-seal') {
                const cx = w / 2;
                const cy = h - 150;

                // draw a sunburst/seal like shape
                const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
                grad.addColorStop(0, '#FCF6BA');
                grad.addColorStop(1, '#b38728');

                ctx.fillStyle = grad;
                ctx.beginPath();
                for (let i = 0; i < 30; i++) {
                    const angle = (i / 30) * Math.PI * 2;
                    const radius = (i % 2 === 0) ? 80 : 65;
                    const x = cx + Math.cos(angle) * radius;
                    const y = cy + Math.sin(angle) * radius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();

                // inner circle
                ctx.beginPath();
                ctx.arc(cx, cy, 50, 0, Math.PI * 2);
                ctx.fillStyle = '#AA771C';
                ctx.fill();
            } else if (badgeStyle === 'blue-ribbon' || badgeStyle === 'red-ribbon') {
                const cx = 150;
                const cy = 150;
                const mainColor = badgeStyle === 'blue-ribbon' ? '#3b82f6' : '#ef4444';
                const tailColor = badgeStyle === 'blue-ribbon' ? '#1e3a8a' : '#991b1b';
                const lightColor = badgeStyle === 'blue-ribbon' ? '#bfdbfe' : '#fca5a5';

                // ribbon tails
                ctx.fillStyle = tailColor;
                ctx.beginPath();
                ctx.moveTo(cx - 20, cy);
                ctx.lineTo(cx - 50, cy + 120);
                ctx.lineTo(cx, cy + 100);
                ctx.lineTo(cx + 50, cy + 120);
                ctx.lineTo(cx + 20, cy);
                ctx.fill();

                // rosette
                ctx.beginPath();
                ctx.arc(cx, cy, 40, 0, Math.PI * 2);
                ctx.fillStyle = mainColor;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cx, cy, 30, 0, Math.PI * 2);
                ctx.strokeStyle = lightColor;
                ctx.lineWidth = 2;
                ctx.stroke();
            } else if (badgeStyle === 'gold-medal') {
                const cx = w / 2;
                const cy = h - 150; // Center bottom

                // ribbon neck
                ctx.fillStyle = '#1e3a8a';
                ctx.beginPath();
                ctx.moveTo(cx - 20, cy - 80);
                ctx.lineTo(cx + 20, cy - 80);
                ctx.lineTo(cx + 10, cy);
                ctx.lineTo(cx - 10, cy);
                ctx.fill();

                // Medal body
                ctx.beginPath();
                ctx.arc(cx, cy, 45, 0, Math.PI * 2);
                ctx.fillStyle = '#D4AF37';
                ctx.fill();
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#AA771C';
                ctx.stroke();

                // Star inside
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
                    const r = (i % 2 === 0) ? 20 : 10;
                    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);

                    const angle2 = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
                    ctx.lineTo(cx + Math.cos(angle2) * 8, cy + Math.sin(angle2) * 8);
                }
                ctx.fill();
            }
            // 4. Custom Texts
            const headerText = headerInput.value.trim();
            if (headerText) {
                ctx.fillStyle = '#111111';
                ctx.font = 'bold 50px "Cinzel", serif, sans-serif'; // Trying a formal font, fallback to standard
                if (ctx.font.indexOf('Cinzel') === -1 && document.fonts && document.fonts.check('50px Cinzel')) {
                    ctx.font = 'bold 50px "Cinzel"';
                }
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(headerText, w / 2, 140);
            }

            const subtitleText = subtitleInput.value.trim();
            let currentY = 220;
            if (subtitleText) {
                ctx.fillStyle = '#555555';
                ctx.font = '24px "Roboto", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(subtitleText, w / 2, currentY);
                currentY += 80; // gap after subtitle
            } else {
                currentY += 40;
            }

            const descText = descriptionInput.value.trim();
            if (descText) {
                ctx.fillStyle = '#333333';
                ctx.font = 'italic 20px "Georgia", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                // Max width for description is canvas width minus some padding (e.g. 200px each side)
                const maxDescWidth = w - 400;
                currentY = wrapText(ctx, descText, w / 2, currentY, maxDescWidth, 36);
            }

            // 5. Center Graphic
            const cGraphic = centerGraphicSelect.value;
            const cgx = w / 2;
            const cgy = h / 2 - 50;
            if (cGraphic === 'star') {
                ctx.fillStyle = '#D4AF37';
                ctx.beginPath();
                for (let i = 0; i < 10; i++) {
                    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
                    const radius = (i % 2 === 0) ? 60 : 30;
                    const x = cgx + Math.cos(angle) * radius;
                    const y = cgy + Math.sin(angle) * radius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
            } else if (cGraphic === 'wreath') {
                // simple laurel wreath shapes
                ctx.strokeStyle = '#4A5D23';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(cgx - 30, cgy, 50, Math.PI * 0.5, Math.PI * 1.5);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cgx + 30, cgy, 50, Math.PI * 1.5, Math.PI * 0.5);
                ctx.stroke();

                // leaves
                ctx.fillStyle = '#4A5D23';
                for (let i = 1; i < 5; i++) {
                    const yOffset = cgy - 40 + (i * 16);
                    ctx.beginPath(); ctx.ellipse(cgx - 85 + (i * 5), yOffset, 12, 6, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(cgx + 85 - (i * 5), yOffset, 12, 6, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
                }
            } else if (cGraphic === 'shield') {
                ctx.fillStyle = '#1e3a8a';
                ctx.beginPath();
                ctx.moveTo(cgx - 40, cgy - 40);
                ctx.lineTo(cgx + 40, cgy - 40);
                ctx.lineTo(cgx + 40, cgy + 10);
                ctx.bezierCurveTo(cgx + 40, cgy + 40, cgx, cgy + 60, cgx, cgy + 60);
                ctx.bezierCurveTo(cgx, cgy + 60, cgx - 40, cgy + 40, cgx - 40, cgy + 10);
                ctx.fill();

                ctx.lineWidth = 3;
                ctx.strokeStyle = '#D4AF37';
                ctx.stroke();
            } else if (cGraphic === 'diamond') {
                ctx.fillStyle = '#059669'; // Emerald
                ctx.beginPath();
                ctx.moveTo(cgx, cgy - 40);
                ctx.lineTo(cgx + 30, cgy);
                ctx.lineTo(cgx, cgy + 40);
                ctx.lineTo(cgx - 30, cgy);
                ctx.fill();

                ctx.lineWidth = 2;
                ctx.strokeStyle = '#34d399';
                ctx.stroke();
            }

            // 6. Signature Lines
            const linesStyle = linesSelect.value;
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 1.5;
            const ly = h - 180;
            if (linesStyle === 'one-center') {
                ctx.beginPath();
                ctx.moveTo(w / 2 - 150, ly);
                ctx.lineTo(w / 2 + 150, ly);
                ctx.stroke();
                ctx.font = '16px Arial';
                ctx.fillStyle = '#666';
                ctx.textAlign = 'center';
                ctx.fillText("Signature", w / 2, ly + 20);
            } else if (linesStyle === 'two-sides') {
                // left
                ctx.beginPath(); ctx.moveTo(w * 0.25 - 120, ly); ctx.lineTo(w * 0.25 + 120, ly); ctx.stroke();
                ctx.font = '16px Arial'; ctx.fillStyle = '#666'; ctx.textAlign = 'center'; ctx.fillText("Authorized Signature", w * 0.25, ly + 20);
                // right
                ctx.beginPath(); ctx.moveTo(w * 0.75 - 120, ly); ctx.lineTo(w * 0.75 + 120, ly); ctx.stroke();
                ctx.font = '16px Arial'; ctx.fillStyle = '#666'; ctx.textAlign = 'center'; ctx.fillText("Date", w * 0.75, ly + 20);
            }

        };

        openBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            drawBuilderCanvas();
        });

        document.getElementById('cancelBuilder').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        // Re-draw on any input change
        bgColorInput.addEventListener('input', drawBuilderCanvas);
        borderSelect.addEventListener('change', drawBuilderCanvas);
        borderColorInput.addEventListener('input', drawBuilderCanvas);
        badgeSelect.addEventListener('change', drawBuilderCanvas);
        if (document.getElementById('builderHeader')) document.getElementById('builderHeader').addEventListener('input', drawBuilderCanvas);
        if (document.getElementById('builderSubtitle')) document.getElementById('builderSubtitle').addEventListener('input', drawBuilderCanvas);
        if (document.getElementById('builderDescription')) document.getElementById('builderDescription').addEventListener('input', drawBuilderCanvas);
        if (document.getElementById('builderCenterGraphic')) document.getElementById('builderCenterGraphic').addEventListener('change', drawBuilderCanvas);
        if (document.getElementById('builderLines')) document.getElementById('builderLines').addEventListener('change', drawBuilderCanvas);

        document.getElementById('applyBuilder').addEventListener('click', () => {
            const dataUrl = canvas.toDataURL('image/png');
            this.loadTemplate(dataUrl);

            document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('selected'));
            const removeBtn = document.getElementById('removeTemplate');
            if (removeBtn) removeBtn.classList.remove('hidden');

            modal.classList.add('hidden');
        });
    }

    setupCropper() {
        this.cropModal = document.getElementById('cropModal');
        this.cropImage = document.getElementById('cropImage');
        this.cropperInstance = null;

        document.getElementById('cancelCrop').addEventListener('click', () => {
            this.closeCropModal();
        });

        document.getElementById('applyCrop').addEventListener('click', () => {
            if (this.cropperInstance) {
                // Get cropped canvas and convert to data URL
                const croppedCanvas = this.cropperInstance.getCroppedCanvas();
                const croppedDataUrl = croppedCanvas.toDataURL('image/png');

                // Load it as the new template
                this.loadTemplate(croppedDataUrl);

                // Update UI state to show it's a custom template
                document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('selected'));
                const removeBtn = document.getElementById('removeTemplate');
                if (removeBtn) removeBtn.classList.remove('hidden');

                this.closeCropModal();
            }
        });
    }



    openCropModal(imgSrc) {
        this.cropImage.src = imgSrc;
        this.cropModal.classList.remove('hidden');

        // Initialize Cropper after image is visible
        setTimeout(() => {
            if (this.cropperInstance) {
                this.cropperInstance.destroy();
            }
            this.cropperInstance = new Cropper(this.cropImage, {
                viewMode: 1, // Restrict the crop box to not exceed the size of the canvas
                dragMode: 'move',
                autoCropArea: 1,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            });
        }, 100);
    }

    closeCropModal() {
        this.cropModal.classList.add('hidden');
        if (this.cropperInstance) {
            this.cropperInstance.destroy();
            this.cropperInstance = null;
        }
        this.cropImage.src = '';
    }

    setupSignaturePad() {
        const modal = document.getElementById('signatureModal');
        const canvas = document.getElementById('signaturePad');
        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let isEraser = false;

        const penToolBtn = document.getElementById('penTool');
        const eraserToolBtn = document.getElementById('eraserTool');

        penToolBtn.addEventListener('click', () => {
            isEraser = false;
            penToolBtn.className = 'primary-btn accent';
            eraserToolBtn.className = 'primary-btn secondary';
            penToolBtn.style.width = 'auto'; penToolBtn.style.padding = '8px 15px'; penToolBtn.style.flex = 'unset';
            eraserToolBtn.style.width = 'auto'; eraserToolBtn.style.padding = '8px 15px'; eraserToolBtn.style.flex = 'unset';
        });

        eraserToolBtn.addEventListener('click', () => {
            isEraser = true;
            eraserToolBtn.className = 'primary-btn accent';
            penToolBtn.className = 'primary-btn secondary';
            penToolBtn.style.width = 'auto'; penToolBtn.style.padding = '8px 15px'; penToolBtn.style.flex = 'unset';
            eraserToolBtn.style.width = 'auto'; eraserToolBtn.style.padding = '8px 15px'; eraserToolBtn.style.flex = 'unset';
        });

        // Draw Helper
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const startDraw = (e) => {
            isDrawing = true;
            const pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);

            if (isEraser) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = 15; // Set thickness for eraser
            } else {
                const inkColor = document.getElementById('signatureInkColor').value || '#000000';
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineWidth = 2; // Set thickness for pen
                ctx.strokeStyle = inkColor;
            }
            e.preventDefault();
        };

        const drawMock = (e) => {
            if (!isDrawing) return;
            const pos = getPos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            e.preventDefault();
        };

        const stopDraw = () => {
            isDrawing = false;
            ctx.beginPath(); // Reset path
        };

        // Events
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', drawMock);
        canvas.addEventListener('mouseup', stopDraw);
        canvas.addEventListener('mouseout', stopDraw);

        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', drawMock, { passive: false });
        canvas.addEventListener('touchend', stopDraw);

        // Listen for color changes instantly
        document.getElementById('signatureInkColor').addEventListener('input', (e) => {
            if (!isEraser) {
                ctx.strokeStyle = e.target.value;
            }
        });

        // Buttons
        document.getElementById('drawSignatureBtn').addEventListener('click', () => {
            modal.classList.remove('hidden');
            // Reset to pen
            isEraser = false;
            penToolBtn.className = 'primary-btn accent';
            eraserToolBtn.className = 'primary-btn secondary';
            penToolBtn.style.width = 'auto'; penToolBtn.style.padding = '8px 15px'; penToolBtn.style.flex = 'unset';
            eraserToolBtn.style.width = 'auto'; eraserToolBtn.style.padding = '8px 15px'; eraserToolBtn.style.flex = 'unset';

            // Note: Not clearing canvas so user can continue editing if they want, unless they click Clear
            // Reset context properties just in case
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = document.getElementById('signatureInkColor').value || '#000000';
        });

        document.getElementById('cancelSignature').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        document.getElementById('clearSignature').addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        document.getElementById('saveSignature').addEventListener('click', () => {
            const dataURL = canvas.toDataURL('image/png');
            const img = new Image();
            img.onload = () => {
                this.elements.signature.image = img;
                this.draw();
                modal.classList.add('hidden');
                document.getElementById('removeSignatureImg').classList.remove('hidden');
                document.getElementById('signatureInput').disabled = true; // Disable text input
            };
            img.src = dataURL;
        });

        document.getElementById('removeSignatureImg').addEventListener('click', () => {
            this.elements.signature.image = null;
            document.getElementById('removeSignatureImg').classList.add('hidden');
            document.getElementById('signatureInput').disabled = false; // Re-enable text
            this.draw();
        });
    }

    loadTemplate(src) {
        const img = new Image();
        // img.crossOrigin = "Anonymous"; // Causes issues for local files
        img.onload = () => {
            this.currentTemplateImg = img;

            this.canvas.width = img.width;
            this.canvas.height = img.height;

            // Set initial positions if not set (center of image)
            const centerX = Math.floor(img.width / 2);
            const centerY = Math.floor(img.height / 2);
            const offset = Math.floor(img.height / 6); // Vertical spacing

            if (this.elements.name.x === 0 && this.elements.name.y === 0) {
                this.elements.name.x = centerX;
                this.elements.name.y = centerY; // Center

                this.elements.date.x = centerX - Math.floor(img.width / 4);
                this.elements.date.y = centerY + offset + 50; // Bottom Left-ish

                this.elements.signature.x = centerX + Math.floor(img.width / 4);
                this.elements.signature.y = centerY + offset + 50; // Bottom Right-ish

                this.elements.signatureLabel.x = this.elements.signature.x;
                this.elements.signatureLabel.y = this.elements.signature.y + 40; // Below signature
            }

            this.eraserHistory = []; // Clear eraser history on new template load
            this.updateInputsFromActiveElement();
            this.draw();
        };
        img.src = src;
    }

    setActiveElement(key) {
        this.activeElementKey = key;

        // Update UI Radio
        document.querySelector(`input[name="activeElement"][value="${key}"]`).checked = true;

        // Show/Hide specific inputs
        ['name', 'date', 'signature', 'signatureLabel'].forEach(k => {
            const group = document.getElementById(`group-${k}`);
            if (k === key) group.classList.remove('hidden');
            else group.classList.add('hidden');
        });

        // Update styling controls to match this element's state
        this.updateInputsFromActiveElement();
    }

    updateActiveElementFromInputs() {
        const config = this.elements[this.activeElementKey];
        config.fontFamily = document.getElementById('fontFamily').value;
        config.fontSize = parseInt(document.getElementById('fontSize').value, 10);
        config.color = document.getElementById('fontColor').value;
        config.x = parseInt(document.getElementById('posX').value, 10);
        config.y = parseInt(document.getElementById('posY').value, 10);
    }

    updateInputsFromActiveElement() {
        const config = this.elements[this.activeElementKey];
        document.getElementById('fontFamily').value = config.fontFamily;
        document.getElementById('fontSize').value = config.fontSize;
        document.getElementById('fontColor').value = config.color;
        document.getElementById('posX').value = config.x;
        document.getElementById('posY').value = config.y;
    }

    parseCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const rows = text.split('\n').map(row => row.trim()).filter(row => row);
            if (rows.length === 0) return;

            const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
            const nameIndex = headers.findIndex(h => h === 'name' || h === 'student name' || h.includes('name'));

            if (nameIndex === -1) {
                alert('CSV must contain a "Name" column.');
                document.getElementById('csvStatus').textContent = 'Error: No "Name" column found';
                return;
            }

            this.csvData = rows.slice(1).map(row => {
                const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                return cols[nameIndex];
            }).filter(name => name);

            document.getElementById('csvStatus').textContent = `Loaded ${this.csvData.length} names`;

            this.populateNameList();

            if (this.csvData.length > 0) {
                this.currentCSVIndex = 0;
                // Switch to name mode and preview first one
                this.setActiveElement('name');
                this.updateNameInputFromCSV();
            } else {
                this.currentCSVIndex = -1;
            }
        };
        reader.readAsText(file);
    }

    draw(overrideName = null) {
        if (!this.currentTemplateImg) return;

        // Clear
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Template
        this.ctx.drawImage(this.currentTemplateImg, 0, 0);

        // Draw Eraser Strokes Over Template 
        if (this.eraserHistory && this.eraserHistory.length > 0) {
            this.eraserHistory.forEach(path => {
                if (path.points.length === 0) return;
                this.ctx.globalCompositeOperation = 'source-over';
                this.ctx.beginPath();
                this.ctx.strokeStyle = path.color;
                this.ctx.lineWidth = path.pSize * this.canvas.width;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.moveTo(path.points[0].px * this.canvas.width, path.points[0].py * this.canvas.height);
                for (let i = 1; i < path.points.length; i++) {
                    this.ctx.lineTo(path.points[i].px * this.canvas.width, path.points[i].py * this.canvas.height);
                }
                this.ctx.stroke();
            });
        }

        // Draw All Elements
        Object.keys(this.elements).forEach(key => {
            const config = this.elements[key];
            if (!config.visible) return; // Skip if hidden

            let textToDraw = config.text;

            // Override Logic for Bulk Generation
            if (key === 'name' && overrideName !== null) {
                textToDraw = overrideName;
            }

            this.ctx.save();

            // Special handling for Signature Image
            if (key === 'signature' && config.image) {
                // scale based on fontSize (let fontSize = height)
                const aspectRatio = config.image.width / config.image.height;
                const drawHeight = config.fontSize * 2; // Arbitrary multiplier to match text visual weight
                const drawWidth = drawHeight * aspectRatio;

                // Centered at x, y
                this.ctx.drawImage(config.image, config.x - drawWidth / 2, config.y - drawHeight / 2, drawWidth, drawHeight);
            } else {
                // Standard Text Drawing
                this.ctx.font = `${config.fontSize}px ${config.fontFamily}`;
                this.ctx.fillStyle = config.color;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(textToDraw, config.x, config.y);
            }

            // Highlight active element with a subtle box if needed
            // Only show if it's the active element AND we are in editing mode (not bulk override)
            if (key === this.activeElementKey && overrideName === null) {
                // Optional highlight logic
            }

            this.ctx.restore();
        });

        // 7. Draw Snapping Guides (Only when dragging)
        if (this.isDragging) {
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            const activeConfig = this.elements[this.activeElementKey];

            this.ctx.save();
            this.ctx.setLineDash([10, 10]);
            this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'; // Semi-transparent blue
            this.ctx.lineWidth = 2;

            // Vertical Center Guide
            if (activeConfig.x === centerX) {
                this.ctx.beginPath();
                this.ctx.moveTo(centerX, 0);
                this.ctx.lineTo(centerX, this.canvas.height);
                this.ctx.stroke();
            }

            // Horizontal Center Guide
            if (activeConfig.y === centerY) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, centerY);
                this.ctx.lineTo(this.canvas.width, centerY);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }
    }

    // Drag and Drop Logic
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    handleMouseDown(e) {
        const coords = this.getCanvasCoordinates(e);

        // Check hit for all elements
        // Iterate and find if we clicked on one. Check active one first if possible?
        // Or just check all.

        let clickedKey = null;

        // Simple hit test: check distance to center
        // Note: For better hit test we'd measure text width, but this is simple radius
        Object.keys(this.elements).forEach(key => {
            const config = this.elements[key];
            // Hit radius depends on font size slightly
            const hitRadius = config.fontSize * 1.5 + 20;

            if (Math.abs(coords.x - config.x) < hitRadius &&
                Math.abs(coords.y - config.y) < hitRadius) {
                clickedKey = key;
            }
        });

        if (clickedKey) {
            this.setActiveElement(clickedKey);
            this.isDragging = true;
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;


        const coords = this.getCanvasCoordinates(e);
        const config = this.elements[this.activeElementKey];

        let newX = Math.floor(coords.x);
        let newY = Math.floor(coords.y);

        // Center Snapping Logic
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        if (Math.abs(newX - centerX) < this.snapThreshold) {
            newX = centerX;
        }
        if (Math.abs(newY - centerY) < this.snapThreshold) {
            newY = centerY;
        }

        config.x = newX;
        config.y = newY;

        this.updateInputsFromActiveElement();
        this.draw();
        e.preventDefault();
    }

    // CSV Helpers
    populateNameList() {
        const listContainer = document.getElementById('csvNameList');
        const removeBtn = document.getElementById('removeCsv');
        const uploadLabel = document.getElementById('csvUploadLabel');
        const uploadInput = document.getElementById('csvUpload');

        listContainer.innerHTML = '';

        if (this.csvData.length === 0) {
            listContainer.classList.remove('visible');
            removeBtn.classList.add('hidden');
            document.getElementById('csvStatus').textContent = 'No file loaded';

            // Enable Upload
            if (uploadLabel) uploadLabel.classList.remove('disabled');
            if (uploadInput) uploadInput.disabled = false;

            this.updatePreviewNavButtons();

            return;
        }

        listContainer.classList.add('visible');
        removeBtn.classList.remove('hidden');
        document.getElementById('csvStatus').textContent = `Loaded ${this.csvData.length} name(s)`;

        // Disable Upload
        if (uploadLabel) uploadLabel.classList.add('disabled');
        if (uploadInput) uploadInput.disabled = true;

        this.csvData.forEach((name, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'csv-name-item';

            // Text Span
            const textSpan = document.createElement('span');
            textSpan.className = 'csv-name-text';
            textSpan.textContent = `${index + 1}. ${name}`;
            textSpan.style.cursor = 'pointer';
            textSpan.onclick = () => {
                this.currentCSVIndex = index;
                this.updateNameInputFromCSV();
            };

            // Delete Button
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-item-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Remove this name';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeNameAtIndex(index);
            };

            itemDiv.appendChild(textSpan);
            itemDiv.appendChild(delBtn);
            listContainer.appendChild(itemDiv);
        });

        this.updateNameInputFromCSV();
        this.updatePreviewNavButtons();
    }

    updatePreviewNavButtons() {
        const prevBtn = document.getElementById('prevCertBtn');
        const nextBtn = document.getElementById('nextCertBtn');
        if (!prevBtn || !nextBtn) return;

        if (this.csvData.length > 1) {
            // Remove hidden class so CSS hover logic applies
            prevBtn.classList.remove('hidden');
            nextBtn.classList.remove('hidden');
        } else {
            // Keep hidden class to completely hide buttons
            prevBtn.classList.add('hidden');
            nextBtn.classList.add('hidden');
        }
    }

    removeNameAtIndex(index) {
        if (index >= 0 && index < this.csvData.length) {
            this.csvData.splice(index, 1);

            // Adjust current index if needed
            if (this.currentCSVIndex >= this.csvData.length) {
                this.currentCSVIndex = this.csvData.length - 1;
            }
            if (this.csvData.length === 0) {
                this.currentCSVIndex = -1;
            }

            this.populateNameList(); // This will re-enable upload if list becomes empty

            // If we deleted the active one or data changed, update preview
            if (this.currentCSVIndex !== -1) {
                this.updateNameInputFromCSV();
            } else {
                // Name list empty, revert to default text?
                this.elements.name.text = "";
                document.getElementById('studentNameInput').value = "";
                this.draw();
            }
        }
    }

    removeCSVData() {
        if (confirm('Are you sure you want to remove all loaded names?')) {
            this.csvData = [];
            this.currentCSVIndex = -1;
            document.getElementById('csvUpload').value = ''; // Reset file input
            this.populateNameList(); // Will re-enable upload

            // Reset preview
            this.elements.name.text = "";
            document.getElementById('studentNameInput').value = "";
            this.draw();
        }
    }

    navigateName(direction) {
        if (this.csvData.length === 0) return;

        let newIndex = this.currentCSVIndex + direction;
        if (newIndex < 0) newIndex = this.csvData.length - 1;
        if (newIndex >= this.csvData.length) newIndex = 0;

        this.currentCSVIndex = newIndex;
        this.updateNameInputFromCSV();
    }

    updateNameInputFromCSV() {
        if (this.currentCSVIndex >= 0 && this.currentCSVIndex < this.csvData.length) {
            const name = this.csvData[this.currentCSVIndex];
            this.elements.name.text = name;
            document.getElementById('studentNameInput').value = name;
            this.draw();

            // Update active state in list
            document.querySelectorAll('.csv-name-item').forEach((item, idx) => {
                item.style.backgroundColor = idx === this.currentCSVIndex ? '#cbd5e1' : 'transparent';
            });
        }
    }

    addNameManually() {
        const input = document.getElementById('studentNameInput');
        const newName = input.value.trim();

        if (!newName) return;

        this.csvData.push(newName);
        this.currentCSVIndex = this.csvData.length - 1;
        this.populateNameList(); // handles UI list and updates nav buttons

        // Select the text so next typing overwrites it easily
        setTimeout(() => input.select(), 10);
    }

    // Exports
    downloadSinglePNG() {
        const link = document.createElement('a');
        const nameText = this.elements.name.text.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.download = `certificate_${nameText}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    downloadSinglePDF() {
        const { jsPDF } = window.jspdf;
        const orientation = this.canvas.width > this.canvas.height ? 'l' : 'p';
        const pdf = new jsPDF(orientation, 'px', [this.canvas.width, this.canvas.height]);

        const imgData = this.canvas.toDataURL('image/jpeg', 1.0);
        pdf.addImage(imgData, 'JPEG', 0, 0, this.canvas.width, this.canvas.height);

        const nameText = this.elements.name.text.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        pdf.save(`certificate_${nameText}.pdf`);
    }

    async generateBulkZip() {
        if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
            alert('Required libraries (JSZip, FileSaver) are not loaded. Please check your internet connection.');
            return;
        }

        if (this.csvData.length === 0) {
            alert('Please upload a CSV file with student names first.');
            return;
        }

        const zip = new JSZip();
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        if (progressContainer) progressContainer.classList.remove('hidden');

        const total = this.csvData.length;

        try {
            for (let i = 0; i < total; i++) {
                const name = this.csvData[i];

                // Draw with override name (Date and Sig stay as configured)
                this.draw(name);

                const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));

                if (!blob) {
                    console.error('Failed to generate image for:', name);
                    continue;
                }

                const safeName = name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
                const filename = `certificate_${safeName}.png`;

                zip.file(filename, blob);

                const percent = Math.floor(((i + 1) / total) * 100);
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (progressText) progressText.textContent = `${percent}% (${i + 1}/${total})`;

                // Allow UI to update
                await new Promise(r => setTimeout(r, 10));
            }

            if (progressText) progressText.textContent = 'Zipping...';
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "certificates.zip");

            if (progressText) progressText.textContent = 'Done!';

        } catch (error) {
            console.error('Bulk generation error:', error);
            alert('An error occurred during generation. See console for details.');
        } finally {
            // Restore view to current selection
            this.updateNameInputFromCSV();
            if (progressContainer) setTimeout(() => progressContainer.classList.add('hidden'), 3000);
        }
    }

    async generateBulkPDF() {
        if (typeof window.jspdf === 'undefined') {
            alert('Required library (jspdf) is not loaded. Check internet connection.');
            return;
        }

        if (this.csvData.length === 0) {
            alert('Please upload a CSV file with student names first.');
            return;
        }

        const { jsPDF } = window.jspdf;
        // const orientation = this.canvas.width > this.canvas.height ? 'l' : 'p';
        // const pdf = new jsPDF(orientation, 'px', [this.canvas.width, this.canvas.height]);

        // Better PDF sizing:
        // Use A4 or similar if possible, or just custom size matching canvas
        const orientation = this.canvas.width > this.canvas.height ? 'l' : 'p';
        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'px',
            format: [this.canvas.width, this.canvas.height]
        });

        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        if (progressContainer) progressContainer.classList.remove('hidden');

        const total = this.csvData.length;

        try {
            for (let i = 0; i < total; i++) {
                const name = this.csvData[i];
                this.draw(name);

                // Add new page for subsequent certificates
                if (i > 0) pdf.addPage([this.canvas.width, this.canvas.height], orientation);

                const imgData = this.canvas.toDataURL('image/jpeg', 1.0);
                pdf.addImage(imgData, 'JPEG', 0, 0, this.canvas.width, this.canvas.height);

                const percent = Math.floor(((i + 1) / total) * 100);
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (progressText) progressText.textContent = `${percent}% (${i + 1}/${total})`;

                await new Promise(r => setTimeout(r, 10)); // Yield to UI
            }

            if (progressText) progressText.textContent = 'Saving PDF...';
            pdf.save("all_certificates.pdf");
            if (progressText) progressText.textContent = 'Done!';

        } catch (error) {
            console.error('Bulk PDF error:', error);
            alert('An error occurred during PDF generation.');
        } finally {
            this.updateNameInputFromCSV();
            if (progressContainer) setTimeout(() => progressContainer.classList.add('hidden'), 3000);
        }
    }
}

window.onload = () => {
    // Setup Authentication Gate
    const accessGate = document.getElementById('accessGate');
    const secretSection = document.getElementById('secretSection');
    const landingPage = document.getElementById('landingPage');
    const goToSecretBtn = document.getElementById('goToSecretBtn');

    const appContainer = document.getElementById('appContainer');
    const loginForm = document.getElementById('loginForm');
    const requestForm = document.getElementById('requestForm');
    const secretCodeInput = document.getElementById('secretCodeInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const showRequestFormBtn = document.getElementById('showRequestFormBtn');
    const showLoginFormBtn = document.getElementById('showLoginFormBtn');
    const sendRequestBtn = document.getElementById('sendRequestBtn');

    // Go to Secret Entry
    if (goToSecretBtn) {
        goToSecretBtn.addEventListener('click', () => {
            landingPage.classList.add('hidden');
            secretSection.classList.remove('hidden');
        });
    }

    // Check if already authenticated in this session
    if (sessionStorage.getItem('certiGenAuth') === 'true') {
        accessGate.classList.add('hidden');
        appContainer.classList.remove('hidden');
        startApp();
    } else {
        // Handle Login
        loginBtn.addEventListener('click', handleLogin);
        secretCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });

        // Toggle Forms
        showRequestFormBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            requestForm.classList.remove('hidden');
        });

        showLoginFormBtn.addEventListener('click', (e) => {
            e.preventDefault();
            requestForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        });

        // Handle Request
        sendRequestBtn.addEventListener('click', handleRequest);

        // Password Visibility Toggle
        const togglePasswordBtn = document.getElementById('togglePasswordBtn');
        togglePasswordBtn.addEventListener('click', () => {
            const type = secretCodeInput.getAttribute('type') === 'password' ? 'text' : 'password';
            secretCodeInput.setAttribute('type', type);

            if (type === 'text') {
                togglePasswordBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye-off"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            } else {
                togglePasswordBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            }
        });
    }

    function handleLogin() {
        if (secretCodeInput.value === SECRET_CODE) {
            // Success
            sessionStorage.setItem('certiGenAuth', 'true');
            accessGate.classList.add('hidden');
            appContainer.classList.remove('hidden');
            startApp();
        } else {
            // Fail
            loginError.classList.remove('hidden');
            setTimeout(() => loginError.classList.add('hidden'), 3000);
        }
    }

    function handleRequest() {
        const name = document.getElementById('reqName').value.trim();
        const phone = document.getElementById('reqPhone').value.trim();
        const dept = document.getElementById('reqDept').value.trim();

        if (!name || !phone || !dept) {
            alert('Please fill in all fields (Name, Mobile, Department) before requesting.');
            return;
        }

        const message = `*Access Request: Certificate Generator*%0A%0A*Name:* ${name}%0A*Mobile:* ${phone}%0A*Dept:* ${dept}%0A%0APlease provide the secret code.`;
        const whatsappUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${message}`;

        // Open WhatsApp in a new tab
        window.open(whatsappUrl, '_blank');

        // Go back to login screen
        requestForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        alert("Your WhatsApp app or web should open now to send the request. Once the admin replies with the code, you can enter it here.");
    }

    function startApp() {
        document.fonts.ready.then(() => {
            new CertificateApp();
            setupLogoutLogic();
        });
    }

    function setupLogoutLogic() {
        const logoutBtn = document.getElementById('logoutBtn');
        const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutes in milliseconds
        let logoutTimer;

        // Manual Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', performLogout);
        }

        // Auto Logout logic
        function resetTimer() {
            clearTimeout(logoutTimer);
            logoutTimer = setTimeout(performLogout, INACTIVITY_LIMIT);
        }

        // Listen for user activity to reset the timer
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keypress', resetTimer);
        window.addEventListener('click', resetTimer);
        window.addEventListener('scroll', resetTimer);
        window.addEventListener('touchstart', resetTimer);

        // Start timer initially
        resetTimer();
    }

    function performLogout() {
        // Clear session storage
        sessionStorage.removeItem('certiGenAuth');

        // Clear secret code input
        document.getElementById('secretCodeInput').value = '';

        // Hide App, Show Gate
        document.getElementById('appContainer').classList.add('hidden');
        document.getElementById('accessGate').classList.remove('hidden');
        document.getElementById('secretSection').classList.add('hidden');
        document.getElementById('landingPage').classList.remove('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('requestForm').classList.add('hidden');

        // Important: reload the page to clear any cached data/canvas states completely
        window.location.reload();
    }
};

// Security: Disable right-click
document.addEventListener('contextmenu', event => {
    event.preventDefault();
    alert("Sorry, right-click is disabled to protect content.");
});

// Security: Disable keyboard shortcuts like Ctrl+U, F12, Ctrl+Shift+I, Ctrl+Shift+J
document.addEventListener('keydown', function (e) {
    if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'j') ||
        (e.ctrlKey && e.key.toLowerCase() === 'u')
    ) {
        e.preventDefault();
        alert("Sorry, viewing the source code is disabled.");
    }
});
