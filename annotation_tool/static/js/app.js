class AnnotationTool {
    constructor() {
        this.currentClip = null;
        this.frames = [];
        this.clips = [];
        this.currentFrameIndex = 0;
        this.frameData = [];
        this.spatialAnnotations = [];
        this.editingAnnotation = null;
        this.annotationCounts = {};

        // Temporal annotation state
        this.temporalAnnotations = [];
        this.editingTemporalAnnotation = null;
        this.editingTemporalRanges = [];

        // Range selection state (simple and clean)
        this.rangeMode = {
            active: false,
            query: '',
            annotationId: null,
            ranges: [],
            dragStart: null,  // frame index where shift+drag started
            shiftStart: undefined,  // frame index where shift+arrow started
            currentRangeIdx: undefined  // index of range currently being built with shift+arrow
        };

        // Directional annotation state
        this.directionalAnnotations = [];
        this.directionalRangeMode = {
            active: false,
            range: null,
            dragStart: null,
            shiftStart: undefined  // frame index where shift+arrow started
        };
        this.pendingDirectional = null;

        this.init();
    }

    async init() {
        await this.loadClips();
        await this.loadAnnotationCounts();
        this.setupTabs();
        this.setupEventListeners();
        this.setupSpatialAnnotations();
        this.setupTemporalAnnotations();
        this.setupDirectionalAnnotations();
    }

    async loadClips() {
        try {
            const response = await fetch('/api/clips');
            this.clips = await response.json();
            this.renderClipList();
        } catch (error) {
            console.error('Failed to load clips:', error);
        }
    }

    async loadAnnotationCounts() {
        try {
            const response = await fetch('/api/annotation-counts');
            this.annotationCounts = await response.json();
            this.renderClipList();
        } catch (error) {
            console.error('Failed to load annotation counts:', error);
            this.annotationCounts = {};
        }
    }

    renderClipList() {
        const clipList = document.getElementById('clipList');
        clipList.innerHTML = '';

        this.clips.forEach(clip => {
            const item = document.createElement('div');
            item.className = 'clip-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = clip.name;
            item.appendChild(nameSpan);

            const badgesContainer = document.createElement('div');
            badgesContainer.className = 'annotation-badges';

            const counts = this.annotationCounts?.[clip.name] || { spatial: 0, temporal: 0, directional: 0 };

            if (counts.spatial > 0) {
                const badge = document.createElement('span');
                badge.className = 'annotation-badge badge-spatial';
                badge.textContent = counts.spatial;
                badge.title = 'Spatial annotations';
                badgesContainer.appendChild(badge);
            }

            if (counts.temporal > 0) {
                const badge = document.createElement('span');
                badge.className = 'annotation-badge badge-temporal';
                badge.textContent = counts.temporal;
                badge.title = 'Temporal annotations';
                badgesContainer.appendChild(badge);
            }

            if (counts.directional > 0) {
                const badge = document.createElement('span');
                badge.className = 'annotation-badge badge-directional';
                badge.textContent = counts.directional;
                badge.title = 'Directional annotations';
                badgesContainer.appendChild(badge);
            }

            item.appendChild(badgesContainer);
            item.addEventListener('click', (e) => this.selectClip(clip, e));
            clipList.appendChild(item);
        });
    }

    async selectClip(clip, event) {
        this.currentClip = clip;

        document.querySelectorAll('.clip-item').forEach(item => {
            item.classList.remove('active');
        });
        if (event && event.target) {
            event.target.classList.add('active');
        }

        document.getElementById('currentClipName').textContent = clip.name;
        document.getElementById('saveBtn').style.display = 'block';

        await this.loadClipFrames(clip.name);
        await this.loadSpatialAnnotations(clip.name);
        await this.loadTemporalAnnotations(clip.name);
        await this.loadDirectionalAnnotations(clip.name);
        this.updateMediaSources(clip.name);
    }

    async loadTemporalAnnotations(clipName) {
        try {
            const response = await fetch(`/api/clips/${clipName}/temporal-annotations`);
            const data = await response.json();
            this.temporalAnnotations = data.annotations || [];
        } catch (error) {
            console.error('Failed to load temporal annotations:', error);
            this.temporalAnnotations = [];
        }
        this.renderTimeline();
        this.renderTemporalAnnotationsList();
        this.updateTemporalFrameOverlay();
    }

    // ==================== TEMPORAL ANNOTATIONS ====================

    setupTemporalAnnotations() {
        // Add Point button - simple prompt workflow
        document.getElementById('addTemporalPitBtn')?.addEventListener('click', () => {
            if (!this.currentClip) {
                alert('Please select a clip first');
                return;
            }

            const query = prompt('Enter query text for this point annotation:');
            if (!query || !query.trim()) return;

            const pitCount = this.temporalAnnotations.filter(a => a.type === 'pit').length;
            const annotation = {
                id: `${this.currentClip.name}_temporal_pit_${pitCount}`,
                type: 'pit',
                query: query.trim(),
                frame: this.currentFrameIndex
            };

            this.temporalAnnotations.push(annotation);
            this.renderTimeline();
            this.renderTemporalAnnotationsList();
            this.updateTemporalFrameOverlay();
        });

        // Add Range button - enter range selection mode
        document.getElementById('addTemporalRangeBtn')?.addEventListener('click', () => {
            if (!this.currentClip) {
                alert('Please select a clip first');
                return;
            }

            if (this.rangeMode.active) {
                // Finish range selection
                this.finishRangeSelection();
            } else {
                // Start range selection
                this.startRangeSelection();
            }
        });

        // Setup the temporal slider for shift+drag
        this.setupTemporalSlider();
        
        // Setup temporal edit modal
        this.setupTemporalEditModal();
    }
    
    setupTemporalEditModal() {
        // Close buttons
        document.getElementById('temporalEditModalClose')?.addEventListener('click', () => {
            this.closeTemporalEditModal();
        });
        document.getElementById('temporalEditModalCancel')?.addEventListener('click', () => {
            this.closeTemporalEditModal();
        });
        
        // Save button
        document.getElementById('temporalEditModalSave')?.addEventListener('click', () => {
            this.saveTemporalEdit();
        });
        
        // Use current frame button
        document.getElementById('temporalEditUseCurrentFrame')?.addEventListener('click', () => {
            document.getElementById('temporalEditFrame').value = this.currentFrameIndex;
        });
        
        // Add range button
        document.getElementById('temporalEditAddRange')?.addEventListener('click', () => {
            this.addEditRange();
        });
        
        // Close on backdrop click
        document.getElementById('temporalEditModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'temporalEditModal') {
                this.closeTemporalEditModal();
            }
        });
    }

    setupTemporalSlider() {
        const slider = document.getElementById('temporalFrameSlider');
        if (!slider) return;

        let shiftWasHeldOnMouseDown = false;

        slider.addEventListener('mousedown', (e) => {
            // Check if shift is held at the moment of mousedown
            if (e.shiftKey && this.rangeMode.active) {
                shiftWasHeldOnMouseDown = true;
                this.rangeMode.dragStart = parseInt(slider.value);
            } else {
                shiftWasHeldOnMouseDown = false;
                this.rangeMode.dragStart = null;
            }
        });

        slider.addEventListener('input', (e) => {
            const newValue = parseInt(e.target.value);
            this.currentFrameIndex = newValue;

            // Sync all sliders
            ['spatialFrameSlider', 'temporalFrameSlider', 'directionalFrameSlider'].forEach(id => {
                document.getElementById(id).value = newValue;
            });

            // Update displays
            this.updateFrameDisplay('spatial');
            this.updateFrameDisplay('temporal');
            this.updateFrameDisplay('directional');
            this.updateFrameLabels();
            this.renderTimeline();
            this.updateTemporalFrameOverlay();

            // Show preview if we're in a shift+drag
            if (shiftWasHeldOnMouseDown && this.rangeMode.active && this.rangeMode.dragStart !== null) {
                this.showRangePreview(this.rangeMode.dragStart, newValue);
            }
        });

        slider.addEventListener('mouseup', (e) => {
            if (shiftWasHeldOnMouseDown && this.rangeMode.active && this.rangeMode.dragStart !== null) {
                const endFrame = parseInt(slider.value);
                const startFrame = this.rangeMode.dragStart;

                if (startFrame !== endFrame) {
                    const range = [Math.min(startFrame, endFrame), Math.max(startFrame, endFrame)];
                    this.addRangeToSelection(range);
                }
            }

            // Reset drag state
            shiftWasHeldOnMouseDown = false;
            this.rangeMode.dragStart = null;
            this.hideRangePreview();
        });

        // Handle mouse leaving the slider during drag
        slider.addEventListener('mouseleave', () => {
            shiftWasHeldOnMouseDown = false;
            this.rangeMode.dragStart = null;
            this.hideRangePreview();
        });
    }

    startRangeSelection() {
        const query = prompt('Enter query text for this range annotation:');
        if (!query || !query.trim()) return;

        const rangeCount = this.temporalAnnotations.filter(a => a.type === 'range').length;

        this.rangeMode = {
            active: true,
            query: query.trim(),
            annotationId: `${this.currentClip.name}_temporal_rng_${rangeCount}`,
            ranges: [],
            dragStart: null,
            shiftStart: undefined,
            currentRangeIdx: undefined
        };

        // Update UI
        const btn = document.getElementById('addTemporalRangeBtn');
        btn.textContent = 'Done (0 ranges)';
        btn.classList.add('btn-active');

        this.showRangeModeStatus();
    }

    finishRangeSelection() {
        const hasRanges = this.rangeMode.ranges.length > 0;
        
        if (!hasRanges) {
            if (!confirm('No ranges selected. Cancel this annotation?')) {
                return;
            }
        }
        
        // Capture data before resetting
        const annotationToSave = hasRanges ? {
            id: this.rangeMode.annotationId,
            type: 'range',
            query: this.rangeMode.query,
            ranges: [...this.rangeMode.ranges]
        } : null;

        // Reset state FIRST to avoid double rendering
        this.rangeMode = {
            active: false,
            query: '',
            annotationId: null,
            ranges: [],
            dragStart: null,
            shiftStart: undefined,
            currentRangeIdx: undefined
        };

        // Update UI
        const btn = document.getElementById('addTemporalRangeBtn');
        btn.textContent = 'Add Range';
        btn.classList.remove('btn-active');
        this.hideRangeModeStatus();

        // Now save and render
        if (annotationToSave) {
            this.temporalAnnotations.push(annotationToSave);
            this.renderTimeline();
            this.renderTemporalAnnotationsList();
            this.updateTemporalFrameOverlay();
        }
    }

    addRangeToSelection(range) {
        // Check for overlaps with existing ranges in this selection
        const overlaps = this.rangeMode.ranges.some(r =>
            (range[0] <= r[1] && range[1] >= r[0])
        );

        if (overlaps) {
            alert('This range overlaps with an existing range in this annotation');
            return;
        }

        this.rangeMode.ranges.push(range);
        this.rangeMode.ranges.sort((a, b) => a[0] - b[0]);

        // Update button text
        const btn = document.getElementById('addTemporalRangeBtn');
        btn.textContent = `Done (${this.rangeMode.ranges.length} ranges)`;

        // Update status
        this.updateRangeModeStatus();

        // Re-render timeline to show the pending ranges
        this.renderTimeline();
    }

    showRangePreview(start, end) {
        const container = document.querySelector('.timeline-content');
        if (!container || this.frameData.length === 0) return;

        let preview = container.querySelector('.range-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'range-preview';
            container.appendChild(preview);
        }

        const minFrame = Math.min(start, end);
        const maxFrame = Math.max(start, end);
        const left = (minFrame / (this.frameData.length - 1)) * 100;
        const width = ((maxFrame - minFrame) / (this.frameData.length - 1)) * 100;

        preview.style.left = `${left}%`;
        preview.style.width = `${width}%`;
        preview.style.display = 'block';
    }

    hideRangePreview() {
        const preview = document.querySelector('.range-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }

    showRangeModeStatus() {
        const status = document.getElementById('rangeSelectionStatus');
        if (status) {
            status.style.display = 'flex';
            this.updateRangeModeStatus();
        }
    }

    hideRangeModeStatus() {
        const status = document.getElementById('rangeSelectionStatus');
        if (status) {
            status.style.display = 'none';
        }
    }

    updateRangeModeStatus() {
        const countEl = document.getElementById('rangeSelectionCount');
        if (countEl) {
            const count = this.rangeMode.ranges.length;
            countEl.textContent = `${count} range${count !== 1 ? 's' : ''}`;
        }
    }

    renderTimeline() {
        const container = document.getElementById('timelineAnnotations');
        const scale = document.getElementById('timelineScale');
        const labelsColumn = document.querySelector('.timeline-labels-column');
        if (!container || !scale || !labelsColumn) return;

        container.innerHTML = '';
        scale.innerHTML = '';
        
        // Clear labels except header
        const header = labelsColumn.querySelector('.timeline-label-header');
        labelsColumn.innerHTML = '';
        if (header) labelsColumn.appendChild(header);

        if (this.frameData.length === 0) return;

        // Scale markers
        const numFrames = this.frameData.length;
        for (let i = 0; i < numFrames; i += 5) {
            const marker = document.createElement('div');
            marker.className = 'timeline-frame-marker';
            marker.style.left = `${(i / (numFrames - 1)) * 100}%`;
            marker.textContent = i;
            scale.appendChild(marker);
        }

        // Current frame indicator
        const indicator = document.createElement('div');
        indicator.className = 'timeline-current-frame';
        indicator.style.left = `${(this.currentFrameIndex / (this.frameData.length - 1)) * 100}%`;
        container.appendChild(indicator);

        // Render saved annotations
        this.temporalAnnotations.forEach(annotation => {
            this.renderAnnotationRow(container, labelsColumn, annotation, false);
        });

        // Render pending ranges if in range mode
        if (this.rangeMode.active && this.rangeMode.ranges.length > 0) {
            const pendingAnnotation = {
                id: this.rangeMode.annotationId,
                type: 'range',
                query: this.rangeMode.query + ' (pending)',
                ranges: this.rangeMode.ranges
            };
            this.renderAnnotationRow(container, labelsColumn, pendingAnnotation, true);
        }
    }

    renderAnnotationRow(container, labelsColumn, annotation, isPending) {
        // Create label in labels column
        const label = document.createElement('div');
        label.className = 'timeline-annotation-label' + (isPending ? ' pending' : '');
        label.textContent = annotation.query;
        label.title = annotation.query;
        labelsColumn.appendChild(label);

        // Create bar row in main container
        const row = document.createElement('div');
        row.className = 'timeline-annotation-row' + (isPending ? ' pending' : '');

        const barContainer = document.createElement('div');
        barContainer.className = 'timeline-annotation-bar-container';

        if (annotation.type === 'pit') {
            const bar = document.createElement('div');
            bar.className = 'timeline-annotation-bar type-pit';
            bar.style.left = `${(annotation.timestep / (this.frameData.length - 1)) * 100}%`;
            bar.title = `Frame ${annotation.timestep}`;
            barContainer.appendChild(bar);
        } else if (annotation.ranges) {
            annotation.ranges.forEach(range => {
                const bar = document.createElement('div');
                bar.className = 'timeline-annotation-bar type-range';
                const startPct = (range[0] / (this.frameData.length - 1)) * 100;
                const widthPct = ((range[1] - range[0]) / (this.frameData.length - 1)) * 100;
                bar.style.left = `${startPct}%`;
                bar.style.width = `${Math.max(widthPct, 0.5)}%`;
                bar.title = `Frames ${range[0]}-${range[1]}`;
                barContainer.appendChild(bar);
            });
        }

        row.appendChild(barContainer);

        if (!isPending) {
            row.addEventListener('click', () => {
                this.editTemporalAnnotation(annotation);
            });
            label.addEventListener('click', () => {
                this.editTemporalAnnotation(annotation);
            });
            label.style.cursor = 'pointer';
        }

        container.appendChild(row);
    }

    renderTemporalAnnotationsList() {
        const list = document.getElementById('temporalAnnotationsList');
        const countLabel = document.getElementById('temporalAnnotationCount');
        if (!list || !countLabel) return;

        countLabel.textContent = `${this.temporalAnnotations.length} annotation${this.temporalAnnotations.length !== 1 ? 's' : ''}`;
        list.innerHTML = '';

        if (this.temporalAnnotations.length === 0) {
            list.innerHTML = '<div class="no-annotations">No temporal annotations yet.</div>';
            return;
        }

        this.temporalAnnotations.forEach(annotation => {
            const item = document.createElement('div');
            item.className = 'annotation-item';

            let metaText = '';
            if (annotation.type === 'pit') {
                metaText = `Frame ${annotation.timestep}`;
            } else {
                metaText = annotation.ranges.map(r => `[${r[0]},${r[1]}]`).join(', ');
            }

            item.innerHTML = `
                <div class="annotation-item-info">
                    <div class="annotation-item-id">${annotation.id}</div>
                    <div class="annotation-item-meta">${metaText}</div>
                </div>
                <div class="annotation-item-query" title="${annotation.query}">${annotation.query}</div>
                <div class="annotation-item-actions">
                    <button class="icon-btn edit" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="icon-btn delete" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            item.querySelector('.icon-btn.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editTemporalAnnotation(annotation);
            });

            item.querySelector('.icon-btn.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTemporalAnnotation(annotation.id);
            });

            item.addEventListener('click', () => {
                if (annotation.type === 'pit') {
                    this.currentFrameIndex = annotation.timestep;
                } else if (annotation.ranges && annotation.ranges.length > 0) {
                    this.currentFrameIndex = annotation.ranges[0][0];
                }
                this.updateAllSliders();
                this.updateAllDisplays();
            });

            list.appendChild(item);
        });
    }

    editTemporalAnnotation(annotation) {
        this.editingTemporalAnnotation = annotation;
        this.editingTemporalRanges = annotation.type === 'range' ? [...annotation.ranges] : [];
        
        const modal = document.getElementById('temporalEditModal');
        
        // Populate fields
        document.getElementById('temporalEditId').textContent = annotation.id;
        document.getElementById('temporalEditType').textContent = annotation.type === 'pit' ? 'Point in Time' : 'Range';
        document.getElementById('temporalEditQuery').value = annotation.query;
        
        // Show/hide appropriate sections
        const pitSection = document.getElementById('temporalEditPitSection');
        const rangeSection = document.getElementById('temporalEditRangeSection');
        
        if (annotation.type === 'pit') {
            pitSection.style.display = 'block';
            rangeSection.style.display = 'none';
            document.getElementById('temporalEditFrame').value = annotation.timestep;
            document.getElementById('temporalEditFrame').max = this.frameData.length - 1;
        } else {
            pitSection.style.display = 'none';
            rangeSection.style.display = 'block';
            this.renderEditRangesList();
        }
        
        modal.classList.add('active');
        document.getElementById('temporalEditQuery').focus();
    }
    
    renderEditRangesList() {
        const container = document.getElementById('temporalEditRangesList');
        container.innerHTML = '';
        
        if (this.editingTemporalRanges.length === 0) {
            container.innerHTML = '<div class="no-ranges">No ranges yet</div>';
            return;
        }
        
        this.editingTemporalRanges.forEach((range, index) => {
            const tag = document.createElement('div');
            tag.className = 'range-tag';
            tag.innerHTML = `[${range[0]}, ${range[1]}] <button type="button" data-index="${index}">&times;</button>`;
            tag.querySelector('button').addEventListener('click', () => {
                this.editingTemporalRanges.splice(index, 1);
                this.renderEditRangesList();
            });
            container.appendChild(tag);
        });
    }
    
    closeTemporalEditModal() {
        document.getElementById('temporalEditModal').classList.remove('active');
        this.editingTemporalAnnotation = null;
        this.editingTemporalRanges = [];
    }
    
    saveTemporalEdit() {
        if (!this.editingTemporalAnnotation) return;
        
        const query = document.getElementById('temporalEditQuery').value.trim();
        if (!query) {
            alert('Please enter a query');
            return;
        }
        
        if (this.editingTemporalAnnotation.type === 'pit') {
            const frame = parseInt(document.getElementById('temporalEditFrame').value);
            if (isNaN(frame) || frame < 0 || frame >= this.frameData.length) {
                alert('Please enter a valid frame number');
                return;
            }
            this.editingTemporalAnnotation.timestep = frame;
        } else {
            if (this.editingTemporalRanges.length === 0) {
                alert('Please add at least one range');
                return;
            }
            this.editingTemporalAnnotation.ranges = [...this.editingTemporalRanges];
        }
        
        this.editingTemporalAnnotation.query = query;
        
        this.closeTemporalEditModal();
        this.renderTimeline();
        this.renderTemporalAnnotationsList();
        this.updateTemporalFrameOverlay();
    }
    
    addEditRange() {
        const startInput = document.getElementById('temporalEditRangeStart');
        const endInput = document.getElementById('temporalEditRangeEnd');
        const start = parseInt(startInput.value);
        const end = parseInt(endInput.value);
        
        if (isNaN(start) || isNaN(end)) {
            alert('Please enter valid frame numbers');
            return;
        }
        
        if (start < 0 || end < 0 || start >= this.frameData.length || end >= this.frameData.length) {
            alert(`Frame numbers must be between 0 and ${this.frameData.length - 1}`);
            return;
        }
        
        const range = [Math.min(start, end), Math.max(start, end)];
        
        // Check overlaps
        const overlaps = this.editingTemporalRanges.some(r => range[0] <= r[1] && range[1] >= r[0]);
        if (overlaps) {
            alert('This range overlaps with an existing range');
            return;
        }
        
        this.editingTemporalRanges.push(range);
        this.editingTemporalRanges.sort((a, b) => a[0] - b[0]);
        this.renderEditRangesList();
        
        startInput.value = '';
        endInput.value = '';
    }

    deleteTemporalAnnotation(annotationId) {
        if (!confirm('Delete this temporal annotation?')) return;
        this.temporalAnnotations = this.temporalAnnotations.filter(a => a.id !== annotationId);
        this.recomputeTemporalAnnotationIds();
        this.renderTimeline();
        this.renderTemporalAnnotationsList();
        this.updateTemporalFrameOverlay();
    }

    recomputeTemporalAnnotationIds() {
        let pitIndex = 0;
        let rangeIndex = 0;

        this.temporalAnnotations = this.temporalAnnotations.map(annotation => {
            if (annotation.type === 'pit') {
                const updatedAnnotation = { ...annotation, id: `${this.currentClip.name}_temporal_pit_${pitIndex}` };
                pitIndex += 1;
                return updatedAnnotation;
            }

            const updatedAnnotation = { ...annotation, id: `${this.currentClip.name}_temporal_rng_${rangeIndex}` };
            rangeIndex += 1;
            return updatedAnnotation;
        });
    }

    updateTemporalFrameOverlay() {
        const overlay = document.getElementById('temporalQueryOverlay');
        const activeLabel = document.getElementById('temporalActiveQueries');
        if (!overlay || !activeLabel) return;

        const active = this.temporalAnnotations.filter(a => {
            if (a.type === 'pit') {
                return a.timestep === this.currentFrameIndex;
            } else {
                return a.ranges.some(r => this.currentFrameIndex >= r[0] && this.currentFrameIndex <= r[1]);
            }
        });

        if (active.length === 0) {
            overlay.innerHTML = '';
            overlay.style.display = 'none';
            activeLabel.textContent = '';
        } else {
            overlay.style.display = 'block';
            overlay.innerHTML = active.map(a => `<div class="temporal-query-item">${a.query}</div>`).join('');
            activeLabel.textContent = `${active.length} active`;
        }
    }

    // ==================== DIRECTIONAL ANNOTATIONS ====================

    async loadDirectionalAnnotations(clipName) {
        try {
            const response = await fetch(`/api/clips/${clipName}/directional-annotations`);
            const data = await response.json();
            this.directionalAnnotations = data.annotations || [];
        } catch (error) {
            console.error('Failed to load directional annotations:', error);
            this.directionalAnnotations = [];
        }
        this.renderDirectionalTimeline();
        this.renderDirectionalAnnotationsList();
        this.updateDirectionalArrowOverlay();
    }

    setupDirectionalAnnotations() {
        // Add Direction button
        document.getElementById('addDirectionalBtn')?.addEventListener('click', () => {
            if (!this.currentClip) {
                alert('Please select a clip first');
                return;
            }

            if (this.directionalRangeMode.active) {
                this.finishDirectionalRangeSelection();
            } else {
                this.startDirectionalRangeSelection();
            }
        });

        this.setupDirectionalSlider();
        this.setupDirectionalModal();
    }

    setupDirectionalSlider() {
        const slider = document.getElementById('directionalFrameSlider');
        if (!slider) return;

        let shiftWasHeldOnMouseDown = false;

        slider.addEventListener('mousedown', (e) => {
            if (e.shiftKey && this.directionalRangeMode.active) {
                shiftWasHeldOnMouseDown = true;
                this.directionalRangeMode.dragStart = parseInt(slider.value);
            } else {
                shiftWasHeldOnMouseDown = false;
                this.directionalRangeMode.dragStart = null;
            }
        });

        slider.addEventListener('input', (e) => {
            const newValue = parseInt(e.target.value);
            this.currentFrameIndex = newValue;

            ['spatialFrameSlider', 'temporalFrameSlider', 'directionalFrameSlider'].forEach(id => {
                document.getElementById(id).value = newValue;
            });

            this.updateFrameDisplay('spatial');
            this.updateFrameDisplay('temporal');
            this.updateFrameDisplay('directional');
            this.updateFrameLabels();
            this.renderTimeline();
            this.renderDirectionalTimeline();
            this.updateTemporalFrameOverlay();
            this.updateDirectionalArrowOverlay();

            if (shiftWasHeldOnMouseDown && this.directionalRangeMode.active && this.directionalRangeMode.dragStart !== null) {
                this.showDirectionalRangePreview(this.directionalRangeMode.dragStart, newValue);
            }
        });

        slider.addEventListener('mouseup', (e) => {
            if (shiftWasHeldOnMouseDown && this.directionalRangeMode.active && this.directionalRangeMode.dragStart !== null) {
                const endFrame = parseInt(slider.value);
                const startFrame = this.directionalRangeMode.dragStart;

                if (startFrame !== endFrame) {
                    const range = [Math.min(startFrame, endFrame), Math.max(startFrame, endFrame)];
                    this.directionalRangeMode.range = range;
                    this.updateDirectionalRangeStatus();
                }
            }

            shiftWasHeldOnMouseDown = false;
            this.directionalRangeMode.dragStart = null;
            this.hideDirectionalRangePreview();
        });

        slider.addEventListener('mouseleave', () => {
            shiftWasHeldOnMouseDown = false;
            this.directionalRangeMode.dragStart = null;
            this.hideDirectionalRangePreview();
        });
    }

    startDirectionalRangeSelection() {
        this.directionalRangeMode = {
            active: true,
            range: null,
            dragStart: null,
            shiftStart: undefined
        };

        const btn = document.getElementById('addDirectionalBtn');
        btn.textContent = 'Done';
        btn.classList.add('btn-active');

        this.showDirectionalRangeModeStatus();
    }

    finishDirectionalRangeSelection() {
        if (!this.directionalRangeMode.range) {
            if (!confirm('No range selected. Cancel this annotation?')) {
                return;
            }
            this.cancelDirectionalRangeSelection();
            return;
        }

        // Open modal to set query and direction
        this.openDirectionalModal(this.directionalRangeMode.range);
    }

    cancelDirectionalRangeSelection() {
        this.directionalRangeMode = {
            active: false,
            range: null,
            dragStart: null
        };

        const btn = document.getElementById('addDirectionalBtn');
        btn.textContent = 'Add Direction';
        btn.classList.remove('btn-active');
        this.hideDirectionalRangeModeStatus();
        this.renderDirectionalTimeline();
    }

    showDirectionalRangeModeStatus() {
        const status = document.getElementById('directionalRangeStatus');
        if (status) {
            status.style.display = 'flex';
            this.updateDirectionalRangeStatus();
        }
    }

    hideDirectionalRangeModeStatus() {
        const status = document.getElementById('directionalRangeStatus');
        if (status) {
            status.style.display = 'none';
        }
    }

    updateDirectionalRangeStatus() {
        const display = document.getElementById('directionalRangeDisplay');
        if (display) {
            if (this.directionalRangeMode.range) {
                const r = this.directionalRangeMode.range;
                display.textContent = `[${r[0]}, ${r[1]}]`;
            } else {
                display.textContent = 'No range selected';
            }
        }
    }

    showDirectionalRangePreview(start, end) {
        const container = document.querySelector('#directional-tab .timeline-content');
        if (!container || this.frameData.length === 0) return;

        let preview = container.querySelector('.range-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'range-preview';
            container.appendChild(preview);
        }

        const minFrame = Math.min(start, end);
        const maxFrame = Math.max(start, end);
        const left = (minFrame / (this.frameData.length - 1)) * 100;
        const width = ((maxFrame - minFrame) / (this.frameData.length - 1)) * 100;

        preview.style.left = `${left}%`;
        preview.style.width = `${width}%`;
        preview.style.display = 'block';
    }

    hideDirectionalRangePreview() {
        const preview = document.querySelector('#directional-tab .range-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }

    setupDirectionalModal() {
        // Close buttons
        document.getElementById('directionalModalClose')?.addEventListener('click', () => {
            this.closeDirectionalModal();
        });
        document.getElementById('directionalModalCancel')?.addEventListener('click', () => {
            this.closeDirectionalModal();
        });

        // Save button
        document.getElementById('directionalModalSave')?.addEventListener('click', () => {
            this.saveDirectionalFromModal();
        });

        // Direction buttons
        ['directionX', 'directionY', 'directionZ'].forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.addEventListener('click', (e) => {
                    if (e.target.classList.contains('dir-btn')) {
                        container.querySelectorAll('.dir-btn').forEach(btn => btn.classList.remove('selected'));
                        e.target.classList.add('selected');
                        this.updateDirectionPreview();
                    }
                });
            }
        });

        // Close on backdrop click
        document.getElementById('directionalModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'directionalModal') {
                this.closeDirectionalModal();
            }
        });
    }

    getDirectionLabels(x, y, z) {
        const labels = [];
        if (x === -1) labels.push('Left');
        else if (x === 1) labels.push('Right');
        if (y === -1) labels.push('Up');
        else if (y === 1) labels.push('Down');
        if (z === -1) labels.push('To Camera');
        else if (z === 1) labels.push('From Camera');
        return labels.length > 0 ? labels.join(', ') : 'Neutral';
    }

    updateDirectionPreview() {
        const x = parseInt(document.querySelector('#directionX .dir-btn.selected')?.dataset.value || '0');
        const y = parseInt(document.querySelector('#directionY .dir-btn.selected')?.dataset.value || '0');
        const z = parseInt(document.querySelector('#directionZ .dir-btn.selected')?.dataset.value || '0');

        const labels = this.getDirectionLabels(x, y, z);
        const preview = document.getElementById('directionPreviewText');
        if (preview) {
            preview.textContent = `${labels} (${x}, ${y}, ${z})`;
        }
    }

    openDirectionalModal(range, existingAnnotation = null) {
        const modal = document.getElementById('directionalModal');
        
        if (existingAnnotation) {
            this.pendingDirectional = { ...existingAnnotation };
            document.getElementById('directionalModalTitle').textContent = 'Edit Directional Annotation';
            document.getElementById('directionalId').textContent = existingAnnotation.id;
            document.getElementById('directionalRange').textContent = `[${existingAnnotation.range[0]}, ${existingAnnotation.range[1]}]`;
            document.getElementById('directionalQueryText').value = existingAnnotation.query;

            // Set direction buttons
            ['X', 'Y', 'Z'].forEach(axis => {
                const container = document.getElementById(`direction${axis}`);
                const value = existingAnnotation.direction[axis.toLowerCase()];
                container.querySelectorAll('.dir-btn').forEach(btn => {
                    btn.classList.toggle('selected', parseInt(btn.dataset.value) === value);
                });
            });
        } else {
            const count = this.directionalAnnotations.length;
            const annotationId = `${this.currentClip.name}_directional_${count}`;
            
            this.pendingDirectional = {
                id: annotationId,
                range: range,
                query: '',
                direction: { x: 0, y: 0, z: 0 }
            };
            
            document.getElementById('directionalModalTitle').textContent = 'Add Directional Annotation';
            document.getElementById('directionalId').textContent = annotationId;
            document.getElementById('directionalRange').textContent = `[${range[0]}, ${range[1]}]`;
            document.getElementById('directionalQueryText').value = '';

            // Reset direction buttons to neutral
            ['X', 'Y', 'Z'].forEach(axis => {
                const container = document.getElementById(`direction${axis}`);
                container.querySelectorAll('.dir-btn').forEach(btn => {
                    btn.classList.toggle('selected', btn.dataset.value === '0');
                });
            });
        }

        this.updateDirectionPreview();
        modal.classList.add('active');
        document.getElementById('directionalQueryText').focus();
    }

    closeDirectionalModal() {
        document.getElementById('directionalModal').classList.remove('active');
        this.pendingDirectional = null;
        this.cancelDirectionalRangeSelection();
    }

    saveDirectionalFromModal() {
        if (!this.pendingDirectional) return;

        const query = document.getElementById('directionalQueryText').value.trim();
        if (!query) {
            alert('Please enter a query text');
            return;
        }

        const x = parseInt(document.querySelector('#directionX .dir-btn.selected')?.dataset.value || '0');
        const y = parseInt(document.querySelector('#directionY .dir-btn.selected')?.dataset.value || '0');
        const z = parseInt(document.querySelector('#directionZ .dir-btn.selected')?.dataset.value || '0');

        const direction = { x, y, z };
        const directionLabel = this.getDirectionLabels(x, y, z);

        const annotation = {
            id: this.pendingDirectional.id,
            range: this.pendingDirectional.range,
            query: query,
            direction: direction,
            direction_label: directionLabel
        };

        // Check if editing or adding
        const existingIndex = this.directionalAnnotations.findIndex(a => a.id === annotation.id);
        if (existingIndex !== -1) {
            this.directionalAnnotations[existingIndex] = annotation;
        } else {
            this.directionalAnnotations.push(annotation);
        }

        document.getElementById('directionalModal').classList.remove('active');
        this.pendingDirectional = null;
        
        // Reset range mode
        this.directionalRangeMode = {
            active: false,
            range: null,
            dragStart: null
        };
        const btn = document.getElementById('addDirectionalBtn');
        btn.textContent = 'Add Direction';
        btn.classList.remove('btn-active');
        this.hideDirectionalRangeModeStatus();

        this.renderDirectionalTimeline();
        this.renderDirectionalAnnotationsList();
        this.updateDirectionalArrowOverlay();
    }

    renderDirectionalTimeline() {
        const container = document.getElementById('directionalTimelineAnnotations');
        const scale = document.getElementById('directionalTimelineScale');
        const labelsColumn = document.querySelector('#directional-tab .timeline-labels-column');
        if (!container || !scale || !labelsColumn) return;

        container.innerHTML = '';
        scale.innerHTML = '';

        const header = labelsColumn.querySelector('.timeline-label-header');
        labelsColumn.innerHTML = '';
        if (header) labelsColumn.appendChild(header);

        if (this.frameData.length === 0) return;

        // Scale markers
        const numFrames = this.frameData.length;
        for (let i = 0; i < numFrames; i += 5) {
            const marker = document.createElement('div');
            marker.className = 'timeline-frame-marker';
            marker.style.left = `${(i / (numFrames - 1)) * 100}%`;
            marker.textContent = i;
            scale.appendChild(marker);
        }

        // Current frame indicator
        const indicator = document.createElement('div');
        indicator.className = 'timeline-current-frame';
        indicator.style.left = `${(this.currentFrameIndex / (this.frameData.length - 1)) * 100}%`;
        container.appendChild(indicator);

        // Render saved annotations
        this.directionalAnnotations.forEach(annotation => {
            this.renderDirectionalAnnotationRow(container, labelsColumn, annotation, false);
        });

        // Render pending range if in range mode
        if (this.directionalRangeMode.active && this.directionalRangeMode.range) {
            const pendingAnnotation = {
                id: 'pending',
                range: this.directionalRangeMode.range,
                query: '(pending)',
                direction_label: '?'
            };
            this.renderDirectionalAnnotationRow(container, labelsColumn, pendingAnnotation, true);
        }
    }

    renderDirectionalAnnotationRow(container, labelsColumn, annotation, isPending) {
        // Create label
        const label = document.createElement('div');
        label.className = 'timeline-annotation-label' + (isPending ? ' pending' : '');
        label.textContent = annotation.query;
        label.title = annotation.query;
        labelsColumn.appendChild(label);

        // Create bar row
        const row = document.createElement('div');
        row.className = 'timeline-annotation-row' + (isPending ? ' pending' : '');

        const barContainer = document.createElement('div');
        barContainer.className = 'timeline-annotation-bar-container';

        const bar = document.createElement('div');
        bar.className = 'timeline-annotation-bar type-directional';
        const startPct = (annotation.range[0] / (this.frameData.length - 1)) * 100;
        const widthPct = ((annotation.range[1] - annotation.range[0]) / (this.frameData.length - 1)) * 100;
        bar.style.left = `${startPct}%`;
        bar.style.width = `${Math.max(widthPct, 0.5)}%`;
        bar.title = `Frames ${annotation.range[0]}-${annotation.range[1]}: ${annotation.direction_label}`;
        barContainer.appendChild(bar);

        row.appendChild(barContainer);

        if (!isPending) {
            row.addEventListener('click', () => this.editDirectionalAnnotation(annotation));
            label.addEventListener('click', () => this.editDirectionalAnnotation(annotation));
            label.style.cursor = 'pointer';
        }

        container.appendChild(row);
    }

    renderDirectionalAnnotationsList() {
        const list = document.getElementById('directionalAnnotationsList');
        const countLabel = document.getElementById('directionalAnnotationCount');
        if (!list || !countLabel) return;

        countLabel.textContent = `${this.directionalAnnotations.length} annotation${this.directionalAnnotations.length !== 1 ? 's' : ''}`;
        list.innerHTML = '';

        if (this.directionalAnnotations.length === 0) {
            list.innerHTML = '<div class="no-annotations">No directional annotations yet.</div>';
            return;
        }

        this.directionalAnnotations.forEach(annotation => {
            const item = document.createElement('div');
            item.className = 'annotation-item';

            const metaText = `[${annotation.range[0]}, ${annotation.range[1]}] - ${annotation.direction_label}`;

            item.innerHTML = `
                <div class="annotation-item-info">
                    <div class="annotation-item-id">${annotation.id}</div>
                    <div class="annotation-item-meta">${metaText}</div>
                </div>
                <div class="annotation-item-query" title="${annotation.query}">${annotation.query}</div>
                <div class="annotation-item-actions">
                    <button class="icon-btn edit" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="icon-btn delete" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            item.querySelector('.icon-btn.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editDirectionalAnnotation(annotation);
            });

            item.querySelector('.icon-btn.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteDirectionalAnnotation(annotation.id);
            });

            item.addEventListener('click', () => {
                this.currentFrameIndex = annotation.range[0];
                this.updateAllSliders();
                this.updateAllDisplays();
            });

            list.appendChild(item);
        });
    }

    editDirectionalAnnotation(annotation) {
        this.openDirectionalModal(annotation.range, annotation);
    }

    deleteDirectionalAnnotation(annotationId) {
        if (!confirm('Delete this directional annotation?')) return;
        this.directionalAnnotations = this.directionalAnnotations.filter(a => a.id !== annotationId);
        this.recomputeDirectionalAnnotationIds();
        this.renderDirectionalTimeline();
        this.renderDirectionalAnnotationsList();
        this.updateDirectionalArrowOverlay();
    }

    recomputeDirectionalAnnotationIds() {
        this.directionalAnnotations = this.directionalAnnotations.map((annotation, index) => ({
            ...annotation,
            id: `${this.currentClip.name}_directional_${index}`
        }));
    }

    updateDirectionalArrowOverlay() {
        const overlay = document.getElementById('directionalArrowOverlay');
        const activeLabel = document.getElementById('directionalActiveQueries');
        if (!overlay || !activeLabel) return;

        const active = this.directionalAnnotations.filter(a => 
            this.currentFrameIndex >= a.range[0] && this.currentFrameIndex <= a.range[1]
        );

        if (active.length === 0) {
            overlay.innerHTML = '';
            overlay.style.display = 'none';
            activeLabel.textContent = '';
        } else {
            overlay.style.display = 'block';
            overlay.innerHTML = active.map(a => {
                const arrowSvg = this.getDirectionArrowSvg(a.direction);
                return `<div class="directional-arrow-item">
                    <div class="arrow-visual">${arrowSvg}</div>
                    <div class="arrow-label">${a.query}: ${a.direction_label}</div>
                </div>`;
            }).join('');
            activeLabel.textContent = `${active.length} active`;
        }
    }

    getDirectionArrowSvg(direction) {
        const { x, y, z } = direction;
        
        // Calculate 2D projection of 3D direction for visualization
        // X maps to horizontal, Y maps to vertical, Z affects size/opacity
        const arrowLength = 30;
        const centerX = 40;
        const centerY = 40;
        
        // Normalize direction for 2D display
        let dx = x * arrowLength;
        let dy = y * arrowLength;
        
        // Z affects the appearance (depth indicator)
        const zIndicator = z !== 0 ? `<circle cx="${centerX}" cy="${centerY}" r="${z === -1 ? 8 : 4}" fill="${z === -1 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'}" stroke="white" stroke-width="1"/>` : '';
        
        if (x === 0 && y === 0 && z === 0) {
            // Neutral - show a dot
            return `<svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="${centerX}" cy="${centerY}" r="6" fill="rgba(255,255,255,0.8)" stroke="white" stroke-width="2"/>
            </svg>`;
        }
        
        const endX = centerX + dx;
        const endY = centerY + dy;
        
        // Arrow head
        const angle = Math.atan2(dy, dx);
        const headLen = 10;
        const head1X = endX - headLen * Math.cos(angle - Math.PI / 6);
        const head1Y = endY - headLen * Math.sin(angle - Math.PI / 6);
        const head2X = endX - headLen * Math.cos(angle + Math.PI / 6);
        const head2Y = endY - headLen * Math.sin(angle + Math.PI / 6);
        
        return `<svg width="80" height="80" viewBox="0 0 80 80">
            ${zIndicator}
            <line x1="${centerX}" y1="${centerY}" x2="${endX}" y2="${endY}" stroke="white" stroke-width="3" stroke-linecap="round"/>
            <polygon points="${endX},${endY} ${head1X},${head1Y} ${head2X},${head2Y}" fill="white"/>
        </svg>`;
    }

    // ==================== SAVE ====================

    async saveAnnotations() {
        if (!this.currentClip) return;

        // Save spatial
        try {
            await fetch(`/api/clips/${this.currentClip.name}/annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ annotations: this.spatialAnnotations })
            });
        } catch (error) {
            console.error('Failed to save spatial annotations:', error);
            alert('Failed to save spatial annotations');
            return;
        }

        // Save temporal
        try {
            await fetch(`/api/clips/${this.currentClip.name}/temporal-annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ annotations: this.temporalAnnotations })
            });
        } catch (error) {
            console.error('Failed to save temporal annotations:', error);
            alert('Failed to save temporal annotations');
            return;
        }

        // Save directional
        try {
            const response = await fetch(`/api/clips/${this.currentClip.name}/directional-annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ annotations: this.directionalAnnotations })
            });

            if (response.ok) {
                alert('Annotations saved successfully!');
                await this.loadAnnotationCounts();
            } else {
                alert('Failed to save directional annotations');
            }
        } catch (error) {
            console.error('Failed to save directional annotations:', error);
            alert('Failed to save directional annotations');
        }
    }

    // ==================== FRAME HANDLING ====================

    async loadClipFrames(clipName) {
        try {
            const response = await fetch(`/api/clips/${clipName}/frames`);
            const data = await response.json();
            this.frames = data.frames;

            this.frameData = this.frames.map(filename => {
                const match = filename.match(/frame_(\d+)_(\d+)\.png/);
                if (match) {
                    return {
                        filename,
                        consecutive: parseInt(match[1]),
                        original: parseInt(match[2])
                    };
                }
                return null;
            }).filter(f => f !== null);

            this.updateFrameSliders();
        } catch (error) {
            console.error('Failed to load frames:', error);
        }
    }

    updateFrameSliders() {
        if (this.frameData.length === 0) return;

        const maxFrame = this.frameData.length - 1;
        ['spatialFrameSlider', 'temporalFrameSlider', 'directionalFrameSlider'].forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            slider.max = maxFrame;
            slider.value = 0;
        });

        this.currentFrameIndex = 0;
        this.updateFrameLabels();
    }

    updateMediaSources(clipName) {
        const videoUrl = `/data/${clipName}/video.mp4`;
        ['spatialVideo', 'temporalVideo', 'directionalVideo'].forEach(videoId => {
            const video = document.getElementById(videoId);
            video.src = videoUrl;
            video.load();
        });

        this.updateFrameDisplay('spatial');
        this.updateFrameDisplay('temporal');
        this.updateFrameDisplay('directional');
    }

    updateFrameDisplay(type) {
        if (this.frameData.length === 0 || !this.currentClip) return;

        const frameInfo = this.frameData[this.currentFrameIndex];
        const frameUrl = `/data/${this.currentClip.name}/${frameInfo.filename}`;
        const img = document.getElementById(`${type}Frame`);
        img.src = frameUrl;

        if (type === 'spatial') {
            // Handle both cached images (already loaded) and new images
            if (img.complete && img.naturalWidth > 0) {
                this.renderAnnotationsOnFrame();
            } else {
                img.onload = () => this.renderAnnotationsOnFrame();
            }
        }
    }

    updateFrameLabels() {
        if (this.frameData.length === 0) return;

        const frameInfo = this.frameData[this.currentFrameIndex];
        const label = `Frame ${frameInfo.consecutive.toString().padStart(2, '0')}`;

        ['spatialFrameLabel', 'temporalFrameLabel', 'directionalFrameLabel'].forEach(labelId => {
            document.getElementById(labelId).textContent = label;
        });
    }

    updateAllSliders() {
        ['spatialFrameSlider', 'temporalFrameSlider', 'directionalFrameSlider'].forEach(sliderId => {
            document.getElementById(sliderId).value = this.currentFrameIndex;
        });
    }

    updateAllDisplays() {
        this.updateFrameDisplay('spatial');
        this.updateFrameDisplay('temporal');
        this.updateFrameDisplay('directional');
        this.updateFrameLabels();
        this.renderTimeline();
        this.renderDirectionalTimeline();
        this.updateTemporalFrameOverlay();
        this.updateDirectionalArrowOverlay();
    }

    // ==================== TABS ====================

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;

                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });
    }

    // ==================== EVENT LISTENERS ====================

    setupEventListeners() {
        // Frame sliders (spatial and directional - temporal handled separately)
        ['spatial', 'directional'].forEach(type => {
            const slider = document.getElementById(`${type}FrameSlider`);
            slider.addEventListener('input', (e) => {
                this.currentFrameIndex = parseInt(e.target.value);
                this.updateAllSliders();
                this.updateAllDisplays();
            });
        });

        // Save button
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveAnnotations();
        });

        // Spatial modal controls
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('modalCancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modalSave').addEventListener('click', () => this.saveAnnotationFromModal());

        document.getElementById('annotationModal').addEventListener('click', (e) => {
            if (e.target.id === 'annotationModal') {
                this.closeModal();
            }
        });

        // Keyboard navigation for frame switching and range selection
        this.setupKeyboardNavigation();
    }

    setupKeyboardNavigation() {
        // Use capture phase to intercept arrow keys before other elements handle them
        document.addEventListener('keydown', (e) => {
            const isArrowLeft = e.key === 'ArrowLeft';
            const isArrowRight = e.key === 'ArrowRight';

            if (!isArrowLeft && !isArrowRight) return;

            // Don't handle if typing in text input/textarea (but DO handle for range sliders)
            const isTextInput = e.target.tagName === 'TEXTAREA' || 
                (e.target.tagName === 'INPUT' && e.target.type !== 'range');
            if (isTextInput) return;
            
            // Don't handle if modal is open
            if (document.querySelector('.modal.active')) return;
            if (!this.currentClip || this.frameData.length === 0) return;

            // Prevent default browser behavior (slider movement, scrolling, etc.)
            e.preventDefault();
            e.stopPropagation();

            // Blur any focused element to prevent conflicts
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }

            const direction = isArrowRight ? 1 : -1;
            const newIndex = Math.max(0, Math.min(this.frameData.length - 1, this.currentFrameIndex + direction));

            if (newIndex === this.currentFrameIndex) return;

            // Get active tab
            const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;

            // Handle shift+arrow for range selection in temporal tab
            if (e.shiftKey && activeTab === 'temporal' && this.rangeMode.active) {
                this.handleTemporalShiftArrow(newIndex);
            }
            // Handle shift+arrow for range selection in directional tab
            else if (e.shiftKey && activeTab === 'directional' && this.directionalRangeMode.active) {
                this.handleDirectionalShiftArrow(newIndex);
            }

            // Always update the frame
            this.currentFrameIndex = newIndex;
            this.updateAllSliders();
            this.updateAllDisplays();
        }, true);  // Use capture phase

        // Reset shift-range state when shift is released
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                // Finalize temporal range - keep the range but reset shift tracking
                if (this.rangeMode.shiftStart !== undefined) {
                    this.rangeMode.shiftStart = undefined;
                    this.rangeMode.currentRangeIdx = undefined;
                }
                // Finalize directional range
                if (this.directionalRangeMode.shiftStart !== undefined) {
                    this.directionalRangeMode.shiftStart = undefined;
                }
            }
        }, true);  // Use capture phase
    }

    handleTemporalShiftArrow(newIndex) {
        // If no range started yet, start from current position (before move)
        if (this.rangeMode.shiftStart === undefined) {
            this.rangeMode.shiftStart = this.currentFrameIndex;
        }

        const startFrame = this.rangeMode.shiftStart;
        const endFrame = newIndex;
        const range = [Math.min(startFrame, endFrame), Math.max(startFrame, endFrame)];

        // Update or add the current range being built
        if (this.rangeMode.currentRangeIdx !== undefined) {
            this.rangeMode.ranges[this.rangeMode.currentRangeIdx] = range;
        } else {
            this.rangeMode.ranges.push(range);
            this.rangeMode.currentRangeIdx = this.rangeMode.ranges.length - 1;
        }

        // Update button text
        const btn = document.getElementById('addTemporalRangeBtn');
        btn.textContent = `Done (${this.rangeMode.ranges.length} range${this.rangeMode.ranges.length !== 1 ? 's' : ''})`;

        this.renderTimeline();
        this.updateRangeModeStatus();
    }

    handleDirectionalShiftArrow(newIndex) {
        // If no range started yet, start from current position (before move)
        if (this.directionalRangeMode.shiftStart === undefined) {
            this.directionalRangeMode.shiftStart = this.currentFrameIndex;
        }

        const startFrame = this.directionalRangeMode.shiftStart;
        const endFrame = newIndex;
        const range = [Math.min(startFrame, endFrame), Math.max(startFrame, endFrame)];

        this.directionalRangeMode.range = range;
        this.updateDirectionalRangeStatus();
        this.renderDirectionalTimeline();
    }

    // ==================== SPATIAL ANNOTATIONS ====================

    async loadSpatialAnnotations(clipName) {
        try {
            const response = await fetch(`/api/clips/${clipName}/annotations`);
            const data = await response.json();
            this.spatialAnnotations = data.annotations || [];
        } catch (error) {
            console.error('Failed to load annotations:', error);
            this.spatialAnnotations = [];
        }
        this.renderAnnotationsList();
        this.renderAnnotationsOnFrame();
    }

    setupSpatialAnnotations() {
        const frameContainer = document.getElementById('spatialFrameContainer');
        const img = document.getElementById('spatialFrame');

        frameContainer.addEventListener('click', (e) => {
            if (!this.currentClip || this.frameData.length === 0) return;
            if (e.target.classList.contains('annotation-point')) return;

            if (!img || !img.naturalWidth || !img.naturalHeight) {
                return;
            }

            const imageRect = img.getBoundingClientRect();
            const clickX = e.clientX - imageRect.left;
            const clickY = e.clientY - imageRect.top;

            if (clickX < 0 || clickX > imageRect.width || clickY < 0 || clickY > imageRect.height) return;

            const normX = clickX / imageRect.width;
            const normY = clickY / imageRect.height;
            const pilX = Math.round(normX * img.naturalWidth);
            const pilY = Math.round(normY * img.naturalHeight);
            const numpyRow = Math.round(normY * img.naturalHeight);
            const numpyCol = Math.round(normX * img.naturalWidth);

            this.openAnnotationModal({ pilX, pilY, numpyRow, numpyCol });
        });

        // Re-render annotations when container resizes
        const resizeObserver = new ResizeObserver(() => {
            this.renderAnnotationsOnFrame();
        });
        resizeObserver.observe(frameContainer);
    }

    openAnnotationModal(coords) {
        const modal = document.getElementById('annotationModal');
        const frameInfo = this.frameData[this.currentFrameIndex];

        const annotationCount = this.spatialAnnotations.length;
        const annotationId = `${this.currentClip.name}_spatial_${annotationCount}`;

        document.getElementById('annotationId').textContent = annotationId;
        document.getElementById('annotationFrame').textContent = `Frame ${frameInfo.consecutive} (original: ${frameInfo.original})`;
        document.getElementById('annotationPilCoords').textContent = `[${coords.pilX}, ${coords.pilY}]`;
        document.getElementById('annotationNumpyCoords').textContent = `[${coords.numpyRow}, ${coords.numpyCol}]`;

        const queryText = document.getElementById('queryText');
        queryText.value = '';

        this.pendingAnnotation = {
            id: annotationId,
            timestep: frameInfo.consecutive,
            pil_coords: [coords.pilX, coords.pilY],
            numpy_coords: [coords.numpyRow, coords.numpyCol],
            query: ''
        };

        if (this.editingAnnotation) {
            queryText.value = this.editingAnnotation.query || '';
            document.querySelector('.modal-header h3').textContent = 'Edit Spatial Annotation';
            this.pendingAnnotation.id = this.editingAnnotation.id;
        } else {
            document.querySelector('.modal-header h3').textContent = 'Add Spatial Annotation';
        }

        modal.classList.add('active');
        queryText.focus();
    }

    closeModal() {
        document.getElementById('annotationModal').classList.remove('active');
        this.pendingAnnotation = null;
        this.editingAnnotation = null;
    }

    saveAnnotationFromModal() {
        if (!this.pendingAnnotation) return;

        const queryText = document.getElementById('queryText').value.trim();
        if (!queryText) {
            alert('Please enter a query text');
            return;
        }

        this.pendingAnnotation.query = queryText;

        if (this.editingAnnotation) {
            const index = this.spatialAnnotations.findIndex(a => a.id === this.editingAnnotation.id);
            if (index !== -1) {
                this.spatialAnnotations[index] = { ...this.pendingAnnotation };
            }
        } else {
            this.spatialAnnotations.push({ ...this.pendingAnnotation });
        }

        this.renderAnnotationsList();
        this.renderAnnotationsOnFrame();
        this.closeModal();
    }

    renderAnnotationsList() {
        const list = document.getElementById('annotationsList');
        const countLabel = document.getElementById('annotationCount');

        countLabel.textContent = `${this.spatialAnnotations.length} annotation${this.spatialAnnotations.length !== 1 ? 's' : ''}`;
        list.innerHTML = '';

        if (this.spatialAnnotations.length === 0) {
            list.innerHTML = '<div class="no-annotations">No annotations yet. Click on a frame to add one.</div>';
            return;
        }

        this.spatialAnnotations.forEach(annotation => {
            const item = document.createElement('div');
            item.className = 'annotation-item';
            item.innerHTML = `
                <div class="annotation-item-info">
                    <div class="annotation-item-id">${annotation.id}</div>
                    <div class="annotation-item-meta">
                        Frame ${annotation.timestep} | PIL: [${annotation.pil_coords[0]}, ${annotation.pil_coords[1]}]
                    </div>
                </div>
                <div class="annotation-item-query" title="${annotation.query}">${annotation.query}</div>
                <div class="annotation-item-actions">
                    <button class="icon-btn edit" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="icon-btn delete" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            item.querySelector('.icon-btn.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editAnnotation(annotation.id);
            });

            item.querySelector('.icon-btn.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteAnnotation(annotation.id);
            });

            item.addEventListener('click', () => {
                this.currentFrameIndex = this.frameData.findIndex(f => f.consecutive === annotation.timestep);
                if (this.currentFrameIndex !== -1) {
                    this.updateAllSliders();
                    this.updateAllDisplays();
                }
            });

            list.appendChild(item);
        });
    }

    renderAnnotationsOnFrame() {
        const frameContainer = document.getElementById('spatialFrameContainer');
        const img = document.getElementById('spatialFrame');

        if (!img || !img.naturalWidth) {
            setTimeout(() => this.renderAnnotationsOnFrame(), 100);
            return;
        }

        frameContainer.querySelectorAll('.annotation-point, .annotation-label').forEach(el => el.remove());

        const currentFrame = this.frameData[this.currentFrameIndex];
        if (!currentFrame) return;

        const renderedWidth = img.clientWidth;
        const renderedHeight = img.clientHeight;
        const offsetX = img.offsetLeft;
        const offsetY = img.offsetTop;
        if (!renderedWidth || !renderedHeight) return;

        const frameAnnotations = this.spatialAnnotations.filter(a => a.timestep === currentFrame.consecutive);

        frameAnnotations.forEach(annotation => {
            const normX = annotation.pil_coords[0] / img.naturalWidth;
            const normY = annotation.pil_coords[1] / img.naturalHeight;

            const displayX = offsetX + normX * renderedWidth;
            const displayY = offsetY + normY * renderedHeight;

            const point = document.createElement('div');
            point.className = 'annotation-point';
            point.style.left = `${displayX}px`;
            point.style.top = `${displayY}px`;

            const label = document.createElement('div');
            label.className = 'annotation-label';
            label.textContent = annotation.query.substring(0, 30) + (annotation.query.length > 30 ? '...' : '');
            label.style.left = `${displayX}px`;
            label.style.top = `${displayY}px`;

            point.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editAnnotation(annotation.id);
            });

            frameContainer.appendChild(point);
            frameContainer.appendChild(label);
        });
    }

    editAnnotation(annotationId) {
        const annotation = this.spatialAnnotations.find(a => a.id === annotationId);
        if (!annotation) return;

        this.editingAnnotation = annotation;
        this.pendingAnnotation = { ...annotation };

        document.getElementById('annotationId').textContent = annotation.id;
        document.getElementById('annotationFrame').textContent = `Frame ${annotation.timestep}`;
        document.getElementById('annotationPilCoords').textContent = `[${annotation.pil_coords[0]}, ${annotation.pil_coords[1]}]`;
        document.getElementById('annotationNumpyCoords').textContent = `[${annotation.numpy_coords[0]}, ${annotation.numpy_coords[1]}]`;
        document.getElementById('queryText').value = annotation.query;

        document.querySelector('.modal-header h3').textContent = 'Edit Spatial Annotation';

        document.getElementById('annotationModal').classList.add('active');
        document.getElementById('queryText').focus();
    }

    recomputeSpatialAnnotationIds() {
        this.spatialAnnotations = this.spatialAnnotations.map((annotation, index) => ({
            ...annotation,
            id: `${this.currentClip.name}_spatial_${index}`
        }));
    }

    deleteAnnotation(annotationId) {
        if (!confirm('Delete this annotation?')) return;
        this.spatialAnnotations = this.spatialAnnotations.filter(a => a.id !== annotationId);
        this.recomputeSpatialAnnotationIds();
        this.renderAnnotationsList();
        this.renderAnnotationsOnFrame();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new AnnotationTool();
});
