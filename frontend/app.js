class CordPlayer {
  constructor() {
    this.audio = document.getElementById('audio-player');
    this.queue = [];
    this.currentIndex = -1;
    this.currentTrack = null;
    this.currentArtistProfile = null;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 'none'; // 'none' | 'all' | 'one'
    this.contextTargetTrack = null;
    
    // Persistent Storage
    this.favorites = JSON.parse(localStorage.getItem('cord_favorites') || '[]');
    this.history = JSON.parse(localStorage.getItem('cord_history') || '[]');
    this.pinnedArtists = JSON.parse(localStorage.getItem('cord_pinned_artists') || '[]');
    this.recentSearches = JSON.parse(localStorage.getItem('cord_recent_searches') || '[]');
    this.downloads = [];
    this.settings = JSON.parse(localStorage.getItem('cord_settings') || '{}');
    
    // Default Settings
    this.theme = this.settings.theme || 'red-white';
    this.themeMode = this.settings.themeMode || 'light';
    this.customThemeData = this.settings.customTheme || { c1: '#FF0D2E', c2: '#FFFFFF', grad: true, angle: 135 };
    this.eqPreset = this.settings.eqPreset || 'flat';
    this.volumeBoost = parseFloat(this.settings.volBoost || '1.0');
    if (isNaN(this.volumeBoost)) this.volumeBoost = 1.0;
    this.seekInterval = parseInt(this.settings.seekInterval || '10');
    this.autoplay = this.settings.autoplay !== false;
    this.sessionRestore = this.settings.sessionRestore !== false;
    
    this.activeFilter = 'all';
    this.currentSearchQuery = '';
    this.lyricsData = null;
    this.searchTimeout = null;

    // WebAudio Graph
    this.audioCtx = null;
    this.gainNode = null;
    this.analyser = null;
    this.eqFilters = [];
    this.eqFrequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

    this.initElements();
    this.applyAllStoredSettings();
    this.initEvents();
    this.renderPinnedArtists();
    this.renderRecentSearches();
    this.loadExplore();
    this.loadRecommendations();
    this.loadDownloads();
    this.renderFavorites();
    this.renderRecentHistory();
    this.initAudioDevices();
    this.updateStorageInfo();
    
    if (this.sessionRestore) {
      this.restoreSession();
    }
  }

  initElements() {
    // Nav & Views (3 Main Tabs + Sub-views)
    this.navItems = document.querySelectorAll('.nav-menu .nav-item');
    this.tabViews = document.querySelectorAll('.tab-view');
    
    // Inputs & Buttons
    this.searchInput = document.getElementById('global-search-input');
    this.clearSearchBtn = document.getElementById('clear-search-btn');
    this.filterChips = document.querySelectorAll('.filter-chip');
    this.suggestionsDropdown = document.getElementById('search-suggestions-dropdown');
    
    // Search Views
    this.searchIdleState = document.getElementById('search-idle-state');
    this.searchActiveResults = document.getElementById('search-active-results');
    this.searchFilterHeader = document.getElementById('search-filter-header');
    this.searchTitle = document.getElementById('search-title');
    this.recentSearchesSection = document.getElementById('recent-searches-section');
    this.recentSearchesChips = document.getElementById('recent-searches-chips');
    this.searchTrendingGrid = document.getElementById('search-trending-grid');
    this.contextMenu = document.getElementById('card-context-menu');
    
    // Player elements
    this.playPauseBtn = document.getElementById('play-pause-btn');
    this.playIcon = document.getElementById('play-icon');
    this.prevBtn = document.getElementById('prev-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.shuffleBtn = document.getElementById('shuffle-btn');
    this.repeatBtn = document.getElementById('repeat-btn');
    this.repeatIcon = document.getElementById('repeat-icon');
    this.likeBtn = document.getElementById('like-btn');
    this.downloadBtn = document.getElementById('download-btn');
    
    // Scrubber & Volume
    this.progressSlider = document.getElementById('progress-slider');
    this.progressFill = document.getElementById('progress-bar-fill');
    this.currentTimeEl = document.getElementById('current-time');
    this.totalTimeEl = document.getElementById('total-time');
    this.volumeSlider = document.getElementById('volume-slider');
    this.volumeIcon = document.getElementById('volume-icon');
    this.muteBtn = document.getElementById('mute-btn');
    
    // Now playing
    this.currentThumb = document.getElementById('current-thumb');
    this.currentTitle = document.getElementById('current-title');
    this.currentArtist = document.getElementById('current-artist');
    
    // Containers
    this.trendingGrid = document.getElementById('trending-grid');
    this.madeForYouGrid = document.getElementById('made-for-you-grid');
    this.podcastEpisodesGrid = document.getElementById('podcast-episodes-grid');
    this.podcastShowsGrid = document.getElementById('podcast-shows-grid');
    this.favoritesGrid = document.getElementById('favorites-grid');
    this.downloadsGrid = document.getElementById('downloads-grid');
    this.recentHistoryGrid = document.getElementById('recent-history-grid');
    this.savedArtistsGrid = document.getElementById('saved-artists-grid');
    this.savedAlbumsGrid = document.getElementById('saved-albums-grid');
    this.pinnedList = document.getElementById('sidebar-pinned-artists-list');
    
    this.queueList = document.getElementById('queue-list');
    this.lyricsScroll = document.getElementById('lyrics-scroll');
    this.canvas = document.getElementById('side-visualizer');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    // Cinema
    this.cinemaOverlay = document.getElementById('cinema-overlay');
    this.cinemaThumb = document.getElementById('cinema-thumb');
    this.cinemaTitle = document.getElementById('cinema-title');
    this.cinemaArtist = document.getElementById('artist-profile-sublink');
    this.cinemaLyricsScroll = document.getElementById('cinema-lyrics-scroll');
    this.cinemaCanvas = document.getElementById('cinema-visualizer');
    this.cinemaCtx = this.cinemaCanvas ? this.cinemaCanvas.getContext('2d') : null;

    // Library Sub Navigation
    this.libPills = document.querySelectorAll('.lib-pill');
    this.libPanels = document.querySelectorAll('.lib-panel');

    // Settings Sub Navigation
    this.settingsNavBtns = document.querySelectorAll('.settings-nav-btn');
    this.settingsPanels = document.querySelectorAll('.settings-panel');
  }

  saveSettings() {
    localStorage.setItem('cord_settings', JSON.stringify(this.settings));
  }

  applyAllStoredSettings() {
    this.applyTheme(this.theme);
    this.applyThemeMode(this.themeMode);
    this.applyBackgroundStyle(this.settings.bgStyle || 'dynamic');
    this.applyBorderRadius(this.settings.borderRadius || 'pill');
    this.toggleSidebarVisualizer(this.settings.showViz !== false);

    if (this.settings.seekInterval) {
      this.seekInterval = parseInt(this.settings.seekInterval);
      const sel = document.getElementById('cfg-seek-interval');
      if (sel) sel.value = this.settings.seekInterval;
    }

    if (this.settings.autoplay !== undefined) {
      this.autoplay = this.settings.autoplay;
      const chk = document.getElementById('cfg-autoplay');
      if (chk) chk.checked = this.settings.autoplay;
    }
  }

  initEvents() {
    // 3 Main Nav tabs
    this.navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    document.getElementById('brand-home-btn')?.addEventListener('click', () => {
      this.switchTab('home');
    });

    // Home Sub-Pills (Music vs Podcasts)
    this.homeTabPills = document.querySelectorAll('.home-tab-pill');
    this.homeTabPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.homeTabPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const tab = pill.dataset.homeTab;
        
        const musicSec = document.getElementById('home-music-section');
        const podcastSec = document.getElementById('home-podcasts-section');
        
        if (tab === 'podcasts') {
          if (musicSec) musicSec.style.display = 'none';
          if (podcastSec) podcastSec.style.display = 'block';
          this.loadPodcasts();
        } else {
          if (musicSec) musicSec.style.display = 'block';
          if (podcastSec) podcastSec.style.display = 'none';
          this.loadExplore();
          this.loadRecommendations();
        }
      });
    });

    document.getElementById('play-featured-podcast-btn')?.addEventListener('click', () => {
      if (this.podcastEpisodes && this.podcastEpisodes.length > 0) {
        this.setQueue(this.podcastEpisodes, 0);
      }
    });

    document.getElementById('refresh-podcasts-btn')?.addEventListener('click', () => {
      this.loadPodcasts();
    });

    // Library Sub-Nav Tabs
    this.libPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.libPills.forEach(p => p.classList.remove('active'));
        this.libPanels.forEach(pan => pan.classList.remove('active'));
        pill.classList.add('active');
        const target = document.getElementById(`lib-sec-${pill.dataset.sub}`);
        if (target) target.classList.add('active');
      });
    });

    // Settings Sub-Navigation
    this.settingsNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.settingsNavBtns.forEach(b => b.classList.remove('active'));
        this.settingsPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const sec = document.getElementById(`sec-${btn.dataset.sec}`);
        if (sec) sec.classList.add('active');
      });
    });

    // Top Search Bar Inputs & Suggestions
    this.searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      this.clearSearchBtn.style.display = q ? 'flex' : 'none';
      clearTimeout(this.searchTimeout);

      if (!q) {
        this.hideSuggestions();
        this.showSearchIdleState();
        return;
      }

      this.searchTimeout = setTimeout(() => {
        this.fetchLiveSuggestions(q);
      }, 200);
    });

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = this.searchInput.value.trim();
        if (q) {
          this.hideSuggestions();
          this.performSearch(q);
        }
      } else if (e.key === 'Escape') {
        this.hideSuggestions();
      }
    });

    this.clearSearchBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.clearSearchBtn.style.display = 'none';
      this.hideSuggestions();
      this.showSearchIdleState();
      this.searchInput.focus();
    });

    // Search Filter Tabs
    this.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFilter = chip.dataset.filter;
        const q = this.searchInput.value.trim() || this.currentSearchQuery;
        if (q) {
          this.performSearch(q);
        }
      });
    });

    // Explore Category Cards Click
    document.querySelectorAll('.explore-cat-card').forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.cat;
        this.activeFilter = cat;
        this.filterChips.forEach(c => c.classList.toggle('active', c.dataset.filter === cat));
        const defaultQueries = {
          songs: 'Trending Hits',
          artists: 'Top Global Artists',
          albums: 'New Album Releases',
          playlists: 'Top Music Playlists'
        };
        const query = defaultQueries[cat] || 'Top Music';
        this.searchInput.value = query;
        this.clearSearchBtn.style.display = 'flex';
        this.performSearch(query);
      });
    });

    // Clear All Recent Searches
    document.getElementById('clear-all-recent-searches-btn')?.addEventListener('click', () => {
      this.recentSearches = [];
      localStorage.removeItem('cord_recent_searches');
      this.renderRecentSearches();
    });

    document.getElementById('add-pinned-artist-btn')?.addEventListener('click', () => {
      this.switchTab('search');
      this.filterChips.forEach(c => c.classList.toggle('active', c.dataset.filter === 'artists'));
      this.activeFilter = 'artists';
      this.searchInput.focus();
    });

    // Player controls
    this.playPauseBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.playPrevious());
    this.nextBtn.addEventListener('click', () => this.playNext());
    
    this.shuffleBtn.addEventListener('click', () => {
      this.isShuffle = !this.isShuffle;
      this.shuffleBtn.classList.toggle('active', this.isShuffle);
    });

    this.repeatBtn.addEventListener('click', () => {
      if (this.repeatMode === 'none') {
        this.repeatMode = 'all';
        this.repeatBtn.classList.add('active');
        this.repeatIcon.innerText = 'repeat';
      } else if (this.repeatMode === 'all') {
        this.repeatMode = 'one';
        this.repeatBtn.classList.add('active');
        this.repeatIcon.innerText = 'repeat_one';
      } else {
        this.repeatMode = 'none';
        this.repeatBtn.classList.remove('active');
        this.repeatIcon.innerText = 'repeat';
      }
    });

    this.likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFavorite();
    });

    this.downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.downloadCurrent();
    });

    // Audio events
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.audio.duration && !isNaN(this.audio.duration)) {
        this.totalTimeEl.innerText = this.formatTime(this.audio.duration);
      }
    });
    this.audio.addEventListener('ended', () => this.onTrackEnded());
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.playIcon.innerText = 'pause';
      this.setupWebAudio();
      this.syncDiscordRPC();
    });
    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.playIcon.innerText = 'play_arrow';
      this.syncDiscordRPC();
    });
    this.audio.addEventListener('error', (e) => {
      console.log('Audio element error:', e);
    });

    // Scrubber
    this.progressSlider.addEventListener('input', (e) => {
      if (this.audio.duration) {
        const seekTime = (e.target.value / 100) * this.audio.duration;
        this.audio.currentTime = seekTime;
      }
    });

    // Volume
    this.volumeSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.audio.volume = v;
      this.updateVolumeIcon(v);
    });

    this.muteBtn.addEventListener('click', () => {
      this.audio.muted = !this.audio.muted;
      this.volumeIcon.innerText = this.audio.muted ? 'volume_off' : 'volume_up';
    });

    // Dark/Light Mode Pill Toggle
    document.getElementById('theme-mode-toggle')?.addEventListener('click', () => {
      const next = this.themeMode === 'light' ? 'dark' : 'light';
      this.applyThemeMode(next);
    });

    // Quick Play & Buttons
    document.getElementById('play-recommendations-btn')?.addEventListener('click', () => {
      if (this.recommendedTracks && this.recommendedTracks.length > 0) {
        this.setQueue(this.recommendedTracks, 0);
      } else if (this.trendingTracks && this.trendingTracks.length > 0) {
        this.setQueue(this.trendingTracks, 0);
      }
    });

    document.getElementById('refresh-recom-btn')?.addEventListener('click', () => {
      this.loadRecommendations();
      this.loadExplore();
    });

    document.getElementById('play-favorites-btn')?.addEventListener('click', () => {
      if (this.favorites.length > 0) {
        this.setQueue(this.favorites, 0);
      }
    });

    document.getElementById('play-downloads-btn')?.addEventListener('click', () => {
      if (this.downloads.length > 0) {
        this.setQueue(this.downloads, 0);
      }
    });

    document.getElementById('clear-history-lib-btn')?.addEventListener('click', () => {
      this.history = [];
      localStorage.removeItem('cord_history');
      this.renderRecentHistory();
      this.loadRecommendations();
    });

    document.getElementById('clear-queue-btn')?.addEventListener('click', () => {
      this.queue = [];
      this.renderQueue();
    });

    // Quick shortcuts
    document.getElementById('quick-lyrics-btn')?.addEventListener('click', () => this.switchTab('lyrics'));
    document.getElementById('quick-eq-btn')?.addEventListener('click', () => this.switchTab('equalizer'));
    document.getElementById('quick-queue-btn')?.addEventListener('click', () => this.switchTab('queue'));
    document.getElementById('header-settings-btn')?.addEventListener('click', () => this.switchTab('settings'));
    document.getElementById('sidebar-settings-btn')?.addEventListener('click', () => this.switchTab('settings'));
    
    // Cinema Mode
    document.getElementById('bar-track-info-click')?.addEventListener('click', (e) => {
      if (!e.target.closest('#like-btn') && !e.target.closest('#download-btn')) {
        this.openCinemaMode();
      }
    });
    document.getElementById('header-cinema-btn')?.addEventListener('click', () => this.openCinemaMode());
    document.getElementById('close-cinema-btn')?.addEventListener('click', () => this.closeCinemaMode());

    // Artist Profile Action Buttons
    document.getElementById('artist-pin-toggle-btn')?.addEventListener('click', () => {
      this.togglePinCurrentArtist();
    });

    document.getElementById('artist-play-top-btn')?.addEventListener('click', () => {
      if (this.currentArtistProfile && this.currentArtistProfile.top_songs.length > 0) {
        this.setQueue(this.currentArtistProfile.top_songs, 0);
      }
    });

    // Context Menu Items Click
    this.contextMenu?.querySelectorAll('.context-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.handleContextMenuAction(action);
        this.closeContextMenu();
      });
    });

    // Global Click to close popovers
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#top-search-box')) {
        this.hideSuggestions();
      }
      if (!e.target.closest('#card-context-menu') && !e.target.closest('.card-more-btn')) {
        this.closeContextMenu();
      }
    });

    // Settings Dropdowns & Customizer
    document.getElementById('cfg-theme-mode')?.addEventListener('change', (e) => {
      this.applyThemeMode(e.target.value);
    });

    document.querySelectorAll('.theme-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.applyTheme(card.dataset.theme);
      });
    });

    this.initCustomColorStudio();

    document.getElementById('apply-custom-theme-btn')?.addEventListener('click', () => {
      const hex1 = document.getElementById('hex-text-1');
      const hex2 = document.getElementById('hex-text-2');
      const gradToggle = document.getElementById('custom-gradient-toggle');
      const angleSlider = document.getElementById('custom-gradient-angle');

      const c1 = hex1 ? hex1.value : '#FF0D2E';
      const c2 = hex2 ? hex2.value : '#FFFFFF';
      const grad = gradToggle ? gradToggle.checked : true;
      const angle = angleSlider ? angleSlider.value : 135;
      
      this.customThemeData = { c1, c2, grad, angle };
      this.settings.customTheme = this.customThemeData;
      this.saveSettings();
      this.applyCustomTheme(this.customThemeData);
    });

    // Background Style
    document.getElementById('cfg-bg-style')?.addEventListener('change', (e) => {
      this.applyBackgroundStyle(e.target.value);
    });

    // Corner Border Radius
    document.getElementById('cfg-border-radius')?.addEventListener('change', (e) => {
      this.applyBorderRadius(e.target.value);
    });

    // Audio Visualizer Toggle
    document.getElementById('cfg-viz-toggle')?.addEventListener('change', (e) => {
      this.toggleSidebarVisualizer(e.target.checked);
    });

    // Autoplay Toggle
    document.getElementById('cfg-autoplay')?.addEventListener('change', (e) => {
      this.autoplay = e.target.checked;
      this.settings.autoplay = e.target.checked;
      this.saveSettings();
    });

    // Seek Interval
    document.getElementById('cfg-seek-interval')?.addEventListener('change', (e) => {
      this.seekInterval = parseInt(e.target.value);
      this.settings.seekInterval = e.target.value;
      this.saveSettings();
    });

    // Equalizer Preset change
    document.getElementById('eq-preset-select')?.addEventListener('change', (e) => {
      this.applyEqPreset(e.target.value);
    });

    // Booster Slider
    document.getElementById('booster-slider')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.volumeBoost = val;
      document.getElementById('booster-val-text').innerText = `${Math.round(val * 100)}%`;
      if (this.gainNode) {
        this.gainNode.gain.value = val;
      }
      this.settings.volBoost = val.toString();
      this.saveSettings();
    });

    // 10 EQ Band Sliders
    for (let i = 0; i < 10; i++) {
      const slider = document.getElementById(`eq-band-${i}`);
      slider?.addEventListener('input', (e) => {
        const db = parseFloat(e.target.value);
        document.getElementById(`eq-val-${i}`).innerText = `${db > 0 ? '+' : ''}${db}dB`;
        if (this.eqFilters[i]) {
          this.eqFilters[i].gain.value = db;
        }
      });
    }

    document.getElementById('reset-eq-btn')?.addEventListener('click', () => {
      this.applyEqPreset('flat');
    });

    document.getElementById('btn-clear-downloads')?.addEventListener('click', async () => {
      if (confirm('Clear all offline downloaded songs?')) {
        await fetch('/api/storage/clear_downloads', { method: 'POST' });
        await this.loadDownloads();
        this.updateStorageInfo();
      }
    });

    document.getElementById('btn-clear-history')?.addEventListener('click', () => {
      this.history = [];
      localStorage.removeItem('cord_history');
      this.renderRecentHistory();
      alert('Listening history cleared.');
      this.loadRecommendations();
    });

    document.getElementById('btn-reset-all-settings')?.addEventListener('click', () => {
      if (confirm('Reset all settings to factory default?')) {
        localStorage.clear();
        location.reload();
      }
    });

    document.getElementById('btn-check-updates')?.addEventListener('click', () => {
      alert('Cord Player is up to date (Version 2.5.0 Music Edition).');
    });

    this.initKeyboardShortcuts();
  }

  switchTab(tabId) {
    this.navItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    this.tabViews.forEach(view => {
      view.classList.toggle('active', view.id === `view-${tabId}`);
    });
    if (tabId === 'search' && !this.searchInput.value.trim()) {
      this.showSearchIdleState();
    }
  }

  // --- RECENT SEARCHES ---
  renderRecentSearches() {
    if (!this.recentSearchesChips || !this.recentSearchesSection) return;
    
    if (!this.recentSearches || this.recentSearches.length === 0) {
      this.recentSearchesSection.style.display = 'none';
      return;
    }

    this.recentSearchesSection.style.display = 'block';
    this.recentSearchesChips.innerHTML = '';

    this.recentSearches.forEach((query, index) => {
      const chip = document.createElement('div');
      chip.className = 'recent-search-chip';
      chip.innerHTML = `
        <span class="material-symbols-rounded" style="font-size: 16px; color: var(--text-dim);">history</span>
        <span>${query}</span>
        <button class="chip-remove-btn" title="Remove"><span class="material-symbols-rounded" style="font-size: 14px;">close</span></button>
      `;

      chip.querySelector('.chip-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeRecentSearch(index);
      });

      chip.addEventListener('click', () => {
        this.searchInput.value = query;
        this.clearSearchBtn.style.display = 'flex';
        this.performSearch(query);
      });

      this.recentSearchesChips.appendChild(chip);
    });
  }

  saveRecentSearch(query) {
    if (!query) return;
    const q = query.trim();
    this.recentSearches = this.recentSearches.filter(s => s.toLowerCase() !== q.toLowerCase());
    this.recentSearches.unshift(q);
    if (this.recentSearches.length > 12) this.recentSearches.pop();
    localStorage.setItem('cord_recent_searches', JSON.stringify(this.recentSearches));
    this.renderRecentSearches();
  }

  removeRecentSearch(index) {
    this.recentSearches.splice(index, 1);
    localStorage.setItem('cord_recent_searches', JSON.stringify(this.recentSearches));
    this.renderRecentSearches();
  }

  // --- LIVE SEARCH SUGGESTIONS ---
  async fetchLiveSuggestions(query) {
    try {
      const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      this.renderSuggestions(data, query);
    } catch (e) {
      this.hideSuggestions();
    }
  }

  renderSuggestions(data, currentQuery) {
    const hasArtists = data.artists && data.artists.length > 0;
    const hasSongs = data.songs && data.songs.length > 0;
    const hasQueries = data.queries && data.queries.length > 0;

    if (!hasArtists && !hasSongs && !hasQueries) {
      this.hideSuggestions();
      return;
    }

    this.suggestionsDropdown.innerHTML = '';

    // 1. Artists Suggestions
    if (hasArtists) {
      const artHeader = document.createElement('div');
      artHeader.className = 'suggestion-section-title';
      artHeader.innerText = 'Artists';
      this.suggestionsDropdown.appendChild(artHeader);

      data.artists.forEach(artist => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          <img src="${artist.thumbnail || '/assets/avatars/default.svg'}" class="artist-circle" alt="${artist.name}">
          <div class="suggestion-text-box">
            <span class="suggestion-primary">${artist.name}</span>
            <span class="suggestion-secondary">Artist Profile</span>
          </div>
          <span class="material-symbols-rounded" style="color: var(--text-dim); font-size: 18px;">arrow_outward</span>
        `;
        item.addEventListener('click', () => {
          this.saveRecentSearch(artist.name);
          this.hideSuggestions();
          this.openArtistProfile(artist.id || artist.name);
        });
        this.suggestionsDropdown.appendChild(item);
      });
    }

    // 2. Songs Suggestions
    if (hasSongs) {
      const songHeader = document.createElement('div');
      songHeader.className = 'suggestion-section-title';
      songHeader.innerText = 'Songs';
      this.suggestionsDropdown.appendChild(songHeader);

      data.songs.forEach(song => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          <img src="${song.thumbnail || '/assets/avatars/music.svg'}" alt="${song.title}">
          <div class="suggestion-text-box">
            <span class="suggestion-primary">${song.title}</span>
            <span class="suggestion-secondary">${song.artist}</span>
          </div>
          <span class="material-symbols-rounded" style="color: var(--primary); font-size: 20px;">play_arrow</span>
        `;
        item.addEventListener('click', () => {
          this.saveRecentSearch(song.title);
          this.hideSuggestions();
          this.playTrack(song);
        });
        this.suggestionsDropdown.appendChild(item);
      });
    }

    // 3. Query suggestions
    if (hasQueries) {
      const qHeader = document.createElement('div');
      qHeader.className = 'suggestion-section-title';
      qHeader.innerText = 'Suggestions';
      this.suggestionsDropdown.appendChild(qHeader);

      data.queries.forEach(q => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          <span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-dim);">search</span>
          <div class="suggestion-text-box">
            <span class="suggestion-primary">${q}</span>
          </div>
        `;
        item.addEventListener('click', () => {
          this.searchInput.value = q;
          this.clearSearchBtn.style.display = 'flex';
          this.hideSuggestions();
          this.performSearch(q);
        });
        this.suggestionsDropdown.appendChild(item);
      });
    }

    this.suggestionsDropdown.style.display = 'flex';
  }

  hideSuggestions() {
    if (this.suggestionsDropdown) {
      this.suggestionsDropdown.style.display = 'none';
      this.suggestionsDropdown.innerHTML = '';
    }
  }

  showSearchIdleState() {
    if (this.searchIdleState) this.searchIdleState.style.display = 'block';
    if (this.searchActiveResults) this.searchActiveResults.style.display = 'none';
    if (this.searchFilterHeader) this.searchFilterHeader.style.display = 'none';
    this.renderRecentSearches();
  }

  // --- SEARCH EXECUTION & RESULTS ---
  async performSearch(query) {
    this.switchTab('search');
    this.currentSearchQuery = query;
    this.saveRecentSearch(query);
    this.hideSuggestions();

    // Switch UI to active results
    if (this.searchIdleState) this.searchIdleState.style.display = 'none';
    if (this.searchFilterHeader) this.searchFilterHeader.style.display = 'block';
    if (this.searchActiveResults) this.searchActiveResults.style.display = 'block';
    
    document.getElementById('search-title').innerText = `Results for "${query}"`;
    document.getElementById('search-no-results').style.display = 'none';

    if (this.activeFilter === 'all') {
      document.getElementById('search-all-sections').style.display = 'block';
      document.getElementById('search-single-cat-grid').style.display = 'none';
      await this.loadAllSearchResults(query);
    } else {
      document.getElementById('search-all-sections').style.display = 'none';
      document.getElementById('search-single-cat-grid').style.display = 'grid';
      await this.loadSingleCatSearchResults(query, this.activeFilter);
    }
  }

  async loadAllSearchResults(query) {
    const topWrap = document.getElementById('search-top-result-wrap');
    const songsSec = document.getElementById('search-songs-section');
    const artistsSec = document.getElementById('search-artists-section');
    const albumsSec = document.getElementById('search-albums-section');
    const playlistsSec = document.getElementById('search-playlists-section');
    const noResults = document.getElementById('search-no-results');

    // Loading indicator
    songsSec.style.display = 'block';
    document.getElementById('search-songs-list').innerHTML = '<div class="empty-state"><p>Searching music...</p></div>';

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&filter=all`);
      const data = await res.json();

      const hasTop = !!data.top_result;
      const hasSongs = data.songs && data.songs.length > 0;
      const hasArtists = data.artists && data.artists.length > 0;
      const hasAlbums = data.albums && data.albums.length > 0;
      const hasPlaylists = data.playlists && data.playlists.length > 0;

      if (!hasTop && !hasSongs && !hasArtists && !hasAlbums && !hasPlaylists) {
        document.getElementById('search-all-sections').style.display = 'none';
        noResults.style.display = 'flex';
        return;
      }

      noResults.style.display = 'none';

      // 1. Top Result
      if (hasTop) {
        const top = data.top_result;
        const isArt = top.type === 'artist';
        const ytFallback = (top.id && !top.id.startsWith('UC') && !top.id.startsWith('MP')) ? `https://i.ytimg.com/vi/${top.id}/hqdefault.jpg` : '/assets/avatars/music.svg';
        const thumb = top.thumbnail || ytFallback;

        topWrap.innerHTML = `
          <div class="top-result-card">
            <img src="${thumb}" class="top-result-thumb ${isArt ? 'artist-circle' : ''}" alt="${top.title}" onerror="this.onerror=null;this.src='${ytFallback}'">
            <div class="top-result-info">
              <span class="top-result-badge">TOP RESULT</span>
              <div class="top-result-title">${top.title || top.name}</div>
              <div class="top-result-subtitle">${isArt ? 'Artist' : (top.artist || 'Track')}</div>
            </div>
            <button class="btn-primary-pill" style="align-self: center;">
              <span class="material-symbols-rounded">${isArt ? 'person' : 'play_arrow'}</span>
              <span>${isArt ? 'View Profile' : 'Play'}</span>
            </button>
          </div>
        `;
        topWrap.onclick = () => {
          if (isArt) {
            this.openArtistProfile(top.id || top.title || top.name);
          } else {
            this.playTrack(top);
          }
        };
        topWrap.style.display = 'block';
      } else {
        topWrap.style.display = 'none';
      }

      // 2. Songs List
      if (hasSongs) {
        songsSec.style.display = 'block';
        const list = document.getElementById('search-songs-list');
        list.innerHTML = '';
        data.songs.slice(0, 5).forEach((song, idx) => {
          const row = document.createElement('div');
          row.className = 'artist-song-row';
          const ytFallback = song.id ? `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg` : '/assets/avatars/music.svg';
          row.innerHTML = `
            <span class="song-rank">#${idx + 1}</span>
            <img src="${song.thumbnail || ytFallback}" class="song-thumb-small" alt="${song.title}" onerror="this.onerror=null;this.src='${ytFallback}'">
            <div class="song-meta-cell">
              <div class="song-title-text" title="${song.title}">${song.title}</div>
              <div class="song-artist-text">${song.artist}</div>
            </div>
            <span class="song-duration-text">${song.duration || '3:30'}</span>
            <button class="icon-btn-small card-more-btn" title="More Options" style="position: static; opacity: 1;"><span class="material-symbols-rounded">more_vert</span></button>
            <button class="icon-btn-small" title="Play"><span class="material-symbols-rounded">play_arrow</span></button>
          `;
          row.querySelector('.card-more-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openContextMenu(e, song);
          });
          row.addEventListener('click', () => {
            this.playTrack(song, [song, ...data.songs.slice(idx + 1)]);
          });
          list.appendChild(row);
        });
      } else {
        songsSec.style.display = 'none';
      }

      // 3. Artists
      if (hasArtists) {
        artistsSec.style.display = 'block';
        const grid = document.getElementById('search-artists-grid');
        grid.innerHTML = '';
        data.artists.slice(0, 6).forEach(artist => {
          const card = document.createElement('div');
          card.className = 'music-card';
          card.innerHTML = `
            <div class="card-thumb-wrap artist-circle">
              <img src="${artist.thumbnail || '/assets/avatars/default.svg'}" alt="${artist.name || artist.title}">
            </div>
            <div class="card-info" style="text-align: center;">
              <div class="card-title">${artist.name || artist.title}</div>
              <div class="card-artist" style="color: var(--primary); font-weight: 700;">Artist Profile</div>
            </div>
          `;
          card.addEventListener('click', () => {
            this.openArtistProfile(artist.id || artist.name || artist.title);
          });
          grid.appendChild(card);
        });
      } else {
        artistsSec.style.display = 'none';
      }

      // 4. Albums
      if (hasAlbums) {
        albumsSec.style.display = 'block';
        this.renderReleaseGrid(data.albums.slice(0, 6), document.getElementById('search-albums-grid'), query);
      } else {
        albumsSec.style.display = 'none';
      }

      // 5. Playlists
      if (hasPlaylists) {
        playlistsSec.style.display = 'block';
        this.renderReleaseGrid(data.playlists.slice(0, 6), document.getElementById('search-playlists-grid'), 'Playlist');
      } else {
        playlistsSec.style.display = 'none';
      }

    } catch (e) {
      console.error('Search error:', e);
      document.getElementById('search-all-sections').style.display = 'none';
      noResults.style.display = 'flex';
    }
  }

  async loadSingleCatSearchResults(query, filter) {
    const grid = document.getElementById('search-single-cat-grid');
    const noResults = document.getElementById('search-no-results');
    grid.innerHTML = '<div class="empty-state"><p>Searching music...</p></div>';

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&filter=${filter}`);
      const data = await res.json();
      const items = data.results || [];

      if (items.length === 0) {
        grid.style.display = 'none';
        noResults.style.display = 'flex';
        return;
      }

      noResults.style.display = 'none';
      grid.style.display = 'grid';
      this.renderSearchCards(items, grid);
    } catch (e) {
      grid.style.display = 'none';
      noResults.style.display = 'flex';
    }
  }

  renderSearchCards(items, container) {
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No results found.</p></div>';
      return;
    }

    container.innerHTML = '';
    items.forEach((item, idx) => {
      const isArtist = item.type === 'artist' || this.activeFilter === 'artists';
      const card = document.createElement('div');
      card.className = 'music-card';
      
      if (isArtist) {
        card.innerHTML = `
          <div class="card-thumb-wrap artist-circle">
            <img src="${item.thumbnail || '/assets/avatars/default.svg'}" alt="${item.title || item.name}" loading="lazy">
          </div>
          <div class="card-info" style="text-align: center;">
            <div class="card-title">${item.title || item.name}</div>
            <div class="card-artist" style="color: var(--primary); font-weight: 700;">Artist Profile</div>
          </div>
        `;
        card.addEventListener('click', () => {
          this.openArtistProfile(item.id || item.title || item.name);
        });
      } else {
        const isDownloaded = this.downloads.some(d => d.id === item.id);
        const ytFallback = (item.id && !item.id.startsWith('UC') && !item.id.startsWith('MP'))
          ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
          : '/assets/avatars/music.svg';
        const thumbSrc = item.thumbnail || ytFallback;

        card.innerHTML = `
          <div class="card-thumb-wrap">
            <img src="${thumbSrc}" alt="${item.title}" loading="lazy" onerror="this.onerror=null;this.src='${ytFallback}'">
            ${isDownloaded ? '<span class="offline-badge material-symbols-rounded" title="Downloaded">offline_pin</span>' : ''}
            <button class="card-more-btn" title="More Options"><span class="material-symbols-rounded">more_vert</span></button>
            <div class="card-play-overlay">
              <button class="play-circle-btn"><span class="material-symbols-rounded">play_arrow</span></button>
            </div>
          </div>
          <div class="card-info">
            <div class="card-title" title="${item.title}">${item.title}</div>
            <div class="card-artist" title="Click to view artist">${item.artist || 'Unknown Artist'}</div>
          </div>
        `;
        card.querySelector('.card-more-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openContextMenu(e, item);
        });
        card.querySelector('.card-artist')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.artist) this.openArtistProfile(item.artist);
        });
        card.addEventListener('click', () => {
          this.playTrack(item, [item, ...items.slice(idx + 1)]);
        });
      }
      container.appendChild(card);
    });
  }

  // --- THREE-DOT CONTEXT MENU ---
  openContextMenu(e, track) {
    this.contextTargetTrack = track;
    if (!this.contextMenu) return;

    // 1. Download vs Delete Download State
    const isDownloaded = this.downloads.some(d => d.id === track.id) || track.is_local;
    const dlBtn = this.contextMenu.querySelector('[data-action="download"]') || this.contextMenu.querySelector('[data-action="delete-download"]');
    if (dlBtn) {
      if (isDownloaded) {
        dlBtn.dataset.action = 'delete-download';
        dlBtn.querySelector('.material-symbols-rounded').innerText = 'delete';
        dlBtn.querySelector('span:last-child').innerText = 'Delete Download';
        dlBtn.style.color = 'var(--primary)';
      } else {
        dlBtn.dataset.action = 'download';
        dlBtn.querySelector('.material-symbols-rounded').innerText = 'download';
        dlBtn.querySelector('span:last-child').innerText = 'Download Offline';
        dlBtn.style.color = '';
      }
    }

    // 2. Favorite vs Remove Favorite State
    const isFav = this.favorites.some(f => f.id === track.id);
    const favBtn = this.contextMenu.querySelector('[data-action="favorite"]') || this.contextMenu.querySelector('[data-action="remove-favorite"]');
    if (favBtn) {
      if (isFav) {
        favBtn.dataset.action = 'remove-favorite';
        favBtn.querySelector('.material-symbols-rounded').innerText = 'heart_minus';
        favBtn.querySelector('span:last-child').innerText = 'Remove Favorite';
      } else {
        favBtn.dataset.action = 'favorite';
        favBtn.querySelector('.material-symbols-rounded').innerText = 'favorite';
        favBtn.querySelector('span:last-child').innerText = 'Add to Favorites';
      }
    }

    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 250);

    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.style.display = 'flex';
  }

  closeContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
      this.contextTargetTrack = null;
    }
  }

  handleContextMenuAction(action) {
    const track = this.contextTargetTrack;
    if (!track) return;

    switch (action) {
      case 'play':
        this.playTrack(track);
        break;
      case 'play-next':
        if (this.currentIndex >= 0 && this.queue.length > 0) {
          this.queue.splice(this.currentIndex + 1, 0, track);
        } else {
          this.queue.unshift(track);
          this.currentIndex = 0;
        }
        this.renderQueue();
        break;
      case 'add-queue':
        this.queue.push(track);
        this.renderQueue();
        break;
      case 'favorite':
      case 'remove-favorite':
        this.toggleFavoriteForTrack(track);
        break;
      case 'download':
        this.downloadSpecificTrack(track);
        break;
      case 'delete-download':
        this.deleteSpecificTrack(track);
        break;
      case 'view-artist':
        if (track.artist) {
          this.openArtistProfile(track.artist);
        }
        break;
    }
  }

  toggleFavoriteForTrack(track) {
    const idx = this.favorites.findIndex(f => f.id === track.id);
    if (idx >= 0) this.favorites.splice(idx, 1);
    else this.favorites.push(track);
    localStorage.setItem('cord_favorites', JSON.stringify(this.favorites));
    this.renderFavorites();
    if (this.currentTrack && this.currentTrack.id === track.id) {
      this.updateNowPlayingUI(this.currentTrack);
    }
  }

  async downloadSpecificTrack(track) {
    try {
      const q = document.getElementById('cfg-dl-quality')?.value || '320';
      await fetch(`/api/download/${track.id}?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}&thumbnail=${encodeURIComponent(track.thumbnail || '')}&quality=${q}`, { method: 'POST' });
      await this.loadDownloads();
      this.updateStorageInfo();
      if (this.currentTrack && this.currentTrack.id === track.id) {
        this.updateNowPlayingUI(this.currentTrack);
      }
    } catch (e) {
      console.log('Download error:', e);
    }
  }

  async deleteSpecificTrack(track) {
    try {
      await fetch(`/api/download/${track.id}`, { method: 'DELETE' });
      await this.loadDownloads();
      this.updateStorageInfo();
      if (this.currentTrack && this.currentTrack.id === track.id) {
        this.updateNowPlayingUI(this.currentTrack);
      }
    } catch (e) {
      console.log('Delete download error:', e);
    }
  }

  // --- PINNED ARTISTS SYSTEM ---
  renderPinnedArtists() {
    if (!this.pinnedList) return;
    this.pinnedList.innerHTML = '';
    
    if (!this.pinnedArtists || this.pinnedArtists.length === 0) {
      this.pinnedList.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-dim); padding: 8px;">No pinned artists yet. Search or click on any artist to pin!</div>';
      return;
    }

    this.pinnedArtists.forEach(artist => {
      const item = document.createElement('div');
      item.className = 'pinned-artist-item';
      item.innerHTML = `
        <img src="${artist.avatar || '/assets/avatars/default.svg'}" alt="${artist.name}">
        <span class="pinned-artist-name">${artist.name}</span>
      `;
      item.addEventListener('click', () => {
        this.openArtistProfile(artist.id || artist.name);
      });
      this.pinnedList.appendChild(item);
    });

    if (this.savedArtistsGrid) {
      this.savedArtistsGrid.innerHTML = '';
      this.pinnedArtists.forEach(artist => {
        const card = document.createElement('div');
        card.className = 'music-card';
        card.innerHTML = `
          <div class="card-thumb-wrap artist-circle">
            <img src="${artist.avatar || '/assets/avatars/default.svg'}" alt="${artist.name}">
          </div>
          <div class="card-info" style="text-align: center;">
            <div class="card-title">${artist.name}</div>
            <div class="card-artist" style="color: var(--primary); font-weight: 700;">Pinned Artist</div>
          </div>
        `;
        card.addEventListener('click', () => {
          this.openArtistProfile(artist.id || artist.name);
        });
        this.savedArtistsGrid.appendChild(card);
      });
    }
  }

  togglePinCurrentArtist() {
    if (!this.currentArtistProfile) return;
    const p = this.currentArtistProfile;
    const idx = this.pinnedArtists.findIndex(a => a.name.toLowerCase() === p.name.toLowerCase());
    
    if (idx >= 0) {
      this.pinnedArtists.splice(idx, 1);
    } else {
      this.pinnedArtists.push({
        id: p.id,
        name: p.name,
        avatar: p.avatar
      });
    }
    
    localStorage.setItem('cord_pinned_artists', JSON.stringify(this.pinnedArtists));
    this.updateArtistPinButton();
    this.renderPinnedArtists();
  }

  updateArtistPinButton() {
    if (!this.currentArtistProfile) return;
    const isPinned = this.pinnedArtists.some(a => a.name.toLowerCase() === this.currentArtistProfile.name.toLowerCase());
    const btn = document.getElementById('artist-pin-toggle-btn');
    const icon = document.getElementById('artist-pin-icon');
    const label = document.getElementById('artist-pin-label');
    
    if (btn && icon && label) {
      if (isPinned) {
        btn.classList.add('btn-primary-pill');
        btn.classList.remove('btn-white-pill');
        icon.innerText = 'check';
        label.innerText = 'Pinned';
      } else {
        btn.classList.remove('btn-primary-pill');
        btn.classList.add('btn-white-pill');
        icon.innerText = 'push_pin';
        label.innerText = 'Pin Artist';
      }
    }
  }

  // --- ARTIST PROFILE PAGE ---
  async openArtistProfile(artistIdOrName) {
    this.switchTab('artist');
    
    document.getElementById('artist-profile-name').innerText = `Loading ${artistIdOrName}...`;
    document.getElementById('artist-profile-desc').innerText = '';
    document.getElementById('artist-latest-releases-grid').innerHTML = '<div class="empty-state"><p>Loading latest releases...</p></div>';
    document.getElementById('artist-top-songs-list').innerHTML = '<div class="empty-state"><p>Loading top tracks...</p></div>';
    document.getElementById('artist-albums-grid').innerHTML = '';
    document.getElementById('artist-singles-grid').innerHTML = '';
    document.getElementById('artist-related-grid').innerHTML = '';

    try {
      const res = await fetch(`/api/artist/${encodeURIComponent(artistIdOrName)}`);
      const data = await res.json();
      this.currentArtistProfile = data;

      // Header Meta
      document.getElementById('artist-profile-name').innerText = data.name;
      document.getElementById('artist-profile-avatar').src = data.avatar || '/assets/avatars/default.svg';
      document.getElementById('artist-profile-desc').innerText = data.description || 'Verified Artist';
      this.updateArtistPinButton();

      // 1. Latest Releases (Sorted newest first)
      const releasesGrid = document.getElementById('artist-latest-releases-grid');
      if (data.latest_releases && data.latest_releases.length > 0) {
        releasesGrid.innerHTML = '';
        data.latest_releases.forEach(rel => {
          const card = document.createElement('div');
          card.className = 'music-card';
          card.innerHTML = `
            <div class="card-thumb-wrap">
              <img src="${rel.thumbnail || data.avatar || '/assets/avatars/music.svg'}" alt="${rel.title}">
              <span class="release-type-badge">${rel.type || 'Release'} ${rel.year ? '• ' + rel.year : ''}</span>
              <div class="card-play-overlay">
                <button class="play-circle-btn"><span class="material-symbols-rounded">play_arrow</span></button>
              </div>
            </div>
            <div class="card-info">
              <div class="card-title" title="${rel.title}">${rel.title}</div>
              <div class="card-artist">${data.name}</div>
            </div>
          `;
          card.addEventListener('click', () => {
            if (rel.id && (rel.id.startsWith('MPREb') || rel.id.startsWith('OLAK5uy'))) {
              this.playAlbum(rel.id);
            } else {
              this.performSearch(`${data.name} ${rel.title}`);
            }
          });
          releasesGrid.appendChild(card);
        });
      } else {
        releasesGrid.innerHTML = '<div class="empty-state"><p>No recent releases found.</p></div>';
      }

      // 2. Top Songs List
      const songsList = document.getElementById('artist-top-songs-list');
      if (data.top_songs && data.top_songs.length > 0) {
        songsList.innerHTML = '';
        data.top_songs.forEach((song, idx) => {
          const row = document.createElement('div');
          row.className = 'artist-song-row';
          row.innerHTML = `
            <span class="song-rank">#${idx + 1}</span>
            <img src="${song.thumbnail || data.avatar || '/assets/avatars/music.svg'}" class="song-thumb-small" alt="${song.title}">
            <div class="song-meta-cell">
              <div class="song-title-text" title="${song.title}">${song.title}</div>
              <div class="song-artist-text">${song.artist || data.name}</div>
            </div>
            <span class="song-duration-text">${song.duration || '3:30'}</span>
            <button class="icon-btn-small card-more-btn" title="More Options" style="position: static; opacity: 1;"><span class="material-symbols-rounded">more_vert</span></button>
            <button class="icon-btn-small" title="Play"><span class="material-symbols-rounded">play_arrow</span></button>
          `;
          row.querySelector('.card-more-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openContextMenu(e, song);
          });
          row.addEventListener('click', () => {
            this.playTrack(song, [song, ...data.top_songs.slice(idx + 1)]);
          });
          songsList.appendChild(row);
        });
      } else {
        songsList.innerHTML = '<div class="empty-state"><p>No top songs listed.</p></div>';
      }

      // 3. Albums
      this.renderReleaseGrid(data.albums, document.getElementById('artist-albums-grid'), data.name);

      // 4. Singles & EPs
      this.renderReleaseGrid(data.singles, document.getElementById('artist-singles-grid'), data.name);

      // 5. Related Artists
      const relGrid = document.getElementById('artist-related-grid');
      if (data.related_artists && data.related_artists.length > 0) {
        relGrid.innerHTML = '';
        data.related_artists.forEach(rel => {
          const card = document.createElement('div');
          card.className = 'music-card';
          card.innerHTML = `
            <div class="card-thumb-wrap artist-circle">
              <img src="${rel.thumbnail || '/assets/avatars/default.svg'}" alt="${rel.name}">
            </div>
            <div class="card-info" style="text-align: center;">
              <div class="card-title">${rel.name}</div>
              <div class="card-artist">${rel.subscribers || 'Artist'}</div>
            </div>
          `;
          card.addEventListener('click', () => {
            this.openArtistProfile(rel.id || rel.name);
          });
          relGrid.appendChild(card);
        });
      } else {
        relGrid.innerHTML = '<div class="empty-state"><p>No related artists available.</p></div>';
      }

    } catch (e) {
      console.error('Artist profile error:', e);
      document.getElementById('artist-profile-name').innerText = artistIdOrName;
    }
  }

  renderReleaseGrid(items, container, artistName) {
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>None available.</p></div>';
      return;
    }
    container.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'music-card';
      card.innerHTML = `
        <div class="card-thumb-wrap">
          <img src="${item.thumbnail || '/assets/avatars/music.svg'}" alt="${item.title}">
          <span class="release-type-badge">${item.year || item.type || 'Album'}</span>
        </div>
        <div class="card-info">
          <div class="card-title" title="${item.title}">${item.title}</div>
          <div class="card-artist">${artistName}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        if (item.id && (item.id.startsWith('MPREb') || item.id.startsWith('OLAK5uy'))) {
          this.playAlbum(item.id);
        } else {
          this.performSearch(`${artistName} ${item.title}`);
        }
      });
      container.appendChild(card);
    });
  }

  async playAlbum(albumBrowseId) {
    try {
      const res = await fetch(`/api/album/${albumBrowseId}`);
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        this.setQueue(data.tracks, 0);
      }
    } catch (e) {
      console.log('Play album error:', e);
    }
  }

  // --- RECOMMENDATIONS & EXPLORE ---
  async loadExplore() {
    try {
      const res = await fetch('/api/explore');
      const data = await res.json();
      this.trendingTracks = data.trending || [];
      if (this.trendingGrid) {
        this.renderCards(this.trendingTracks, this.trendingGrid);
      }
      
      // Also populate 6-8 trending songs into Search Idle state!
      if (this.searchTrendingGrid) {
        this.renderCards(this.trendingTracks.slice(0, 8), this.searchTrendingGrid);
      }
    } catch (e) {
      console.error('Explore load error:', e);
    }
  }

  async loadRecommendations() {
    try {
      const seedIds = this.history.slice(0, 5).map(h => h.id);
      const seedArtists = [...new Set(this.history.map(h => h.artist))].filter(Boolean);

      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed_ids: seedIds, seed_artists: seedArtists })
      });
      const data = await res.json();
      this.recommendedTracks = data.recommendations || [];
      if (this.madeForYouGrid) {
        this.renderCards(this.recommendedTracks, this.madeForYouGrid);
      }
    } catch (e) {
      console.log('Recs load error:', e);
    }
  }

  async loadDownloads() {
    try {
      const res = await fetch('/api/downloads');
      const data = await res.json();
      this.downloads = data.downloads || [];
      if (this.downloadsGrid) {
        this.renderCards(this.downloads, this.downloadsGrid, true);
      }
    } catch (e) {
      console.error('Downloads load error:', e);
    }
  }

  async loadPodcasts() {
    const epGrid = document.getElementById('podcast-episodes-grid');
    const showGrid = document.getElementById('podcast-shows-grid');
    
    if (epGrid) epGrid.innerHTML = '<div class="empty-state"><p>Loading podcast episodes...</p></div>';
    if (showGrid) showGrid.innerHTML = '<div class="empty-state"><p>Loading shows...</p></div>';

    try {
      const res = await fetch('/api/podcasts');
      const data = await res.json();
      this.podcastEpisodes = data.episodes || [];
      this.podcastShows = data.shows || [];

      if (epGrid) {
        this.renderCards(this.podcastEpisodes, epGrid);
      }

      if (showGrid) {
        if (this.podcastShows.length === 0) {
          showGrid.innerHTML = '<div class="empty-state"><p>No podcast shows available.</p></div>';
        } else {
          showGrid.innerHTML = '';
          this.podcastShows.forEach(show => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.innerHTML = `
              <div class="card-thumb-wrap">
                <img src="${show.thumbnail || '/assets/avatars/music.svg'}" alt="${show.title}" loading="lazy">
                <span class="release-type-badge">Show</span>
              </div>
              <div class="card-info">
                <div class="card-title" title="${show.title}">${show.title}</div>
                <div class="card-artist">${show.artist}</div>
              </div>
            `;
            card.addEventListener('click', () => {
              this.searchInput.value = show.title;
              this.clearSearchBtn.style.display = 'flex';
              this.performSearch(show.title);
            });
            showGrid.appendChild(card);
          });
        }
      }
    } catch (e) {
      console.error('Podcasts load error:', e);
      if (epGrid) epGrid.innerHTML = '<div class="empty-state"><p>Could not load podcasts.</p></div>';
    }
  }

  renderCards(items, container, isDownloadView = false) {
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No tracks found.</p></div>';
      return;
    }

    container.innerHTML = '';
    items.forEach((item, idx) => {
      const isDownloaded = this.downloads.some(d => d.id === item.id);
      const ytFallback = (item.id && !item.id.startsWith('UC') && !item.id.startsWith('MP'))
        ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
        : '/assets/avatars/music.svg';
      const isEpisode = item.type === 'episode';
      const durationBadge = item.duration && item.duration !== '0:00' 
        ? `<span class="release-type-badge">${isEpisode ? '🎙️ ' : ''}${item.duration}</span>` 
        : (isEpisode ? '<span class="release-type-badge">🎙️ Episode</span>' : '');

      const card = document.createElement('div');
      card.className = 'music-card';
      card.innerHTML = `
        <div class="card-thumb-wrap">
          <img src="${item.thumbnail || ytFallback}" alt="${item.title}" loading="lazy" onerror="this.onerror=null;this.src='${ytFallback}'">
          ${durationBadge}
          ${isDownloaded ? '<span class="offline-badge material-symbols-rounded" title="Offline">offline_pin</span>' : ''}
          <button class="card-more-btn" title="More Options"><span class="material-symbols-rounded">more_vert</span></button>
          <div class="card-play-overlay">
            <button class="play-circle-btn"><span class="material-symbols-rounded">play_arrow</span></button>
          </div>
        </div>
        <div class="card-info">
          <div class="card-title" title="${item.title}">${item.title}</div>
          <div class="card-artist" title="Click to view details">${item.artist || 'Unknown Artist'}</div>
        </div>
      `;
      card.querySelector('.card-more-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openContextMenu(e, item);
      });
      card.querySelector('.card-artist')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.artist) this.openArtistProfile(item.artist);
      });
      card.addEventListener('click', () => {
        this.playTrack(item, [item, ...items.slice(idx + 1)]);
      });
      container.appendChild(card);
    });
  }

  async playTrack(track, upcomingList = null) {
    if (!track || !track.id) return;
    this.currentTrack = track;
    this.updateNowPlayingUI(track);
    this.trackHistory(track);

    if (upcomingList) {
      this.queue = upcomingList;
      this.currentIndex = 0;
      this.renderQueue();
    }

    try {
      this.currentTitle.innerText = `Loading "${track.title}"...`;
      this.audio.pause();
      this.audio.src = `/api/audio/${track.id}`;
      this.audio.load();
      
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        try { await this.audioCtx.resume(); } catch (err) {}
      }

      const p = this.audio.play();
      if (p !== undefined) {
        p.catch(e => {
          console.log('Audio play catch:', e);
        });
      }
      this.isPlaying = true;
      this.playIcon.innerText = 'pause';
      this.updateNowPlayingUI(track);
      this.updateMediaSession(track);
      this.loadLyrics(track);
      this.fetchRadioUpNext(track.id);
      this.saveSession();
    } catch (e) {
      console.error('Streaming error:', e);
      this.updateNowPlayingUI(track);
    }
  }

  setQueue(tracks, startIndex = 0) {
    this.queue = tracks;
    this.currentIndex = startIndex;
    this.renderQueue();
    if (tracks.length > 0) {
      this.playTrack(tracks[startIndex]);
    }
  }

  togglePlay() {
    if (!this.audio.src) {
      if (this.queue.length > 0) this.playTrack(this.queue[0]);
      else if (this.trendingTracks && this.trendingTracks.length > 0) this.playTrack(this.trendingTracks[0]);
      return;
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { this.audioCtx.resume(); } catch (e) {}
    }
    if (this.audio.paused) {
      const p = this.audio.play();
      if (p !== undefined) {
        p.then(() => {
          this.isPlaying = true;
          this.playIcon.innerText = 'pause';
        }).catch(err => {
          console.log('Play error:', err);
          if (this.currentTrack) {
            this.playTrack(this.currentTrack);
          }
        });
      }
    } else {
      this.audio.pause();
      this.isPlaying = false;
      this.playIcon.innerText = 'play_arrow';
    }
  }

  playNext() {
    if (this.queue.length === 0) return;
    if (this.isShuffle) {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    }
    this.playTrack(this.queue[this.currentIndex]);
  }

  playPrevious() {
    if (this.queue.length === 0) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    this.playTrack(this.queue[this.currentIndex]);
  }

  onTrackEnded() {
    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play();
    } else if (this.repeatMode === 'all' || this.currentIndex < this.queue.length - 1) {
      this.playNext();
    } else if (this.autoplay && this.queue.length > 0) {
      this.loadRecommendations().then(() => {
        if (this.queue.length > 0) this.playNext();
      });
    }
  }

  onTimeUpdate() {
    if (!this.audio.duration || isNaN(this.audio.duration)) return;
    const pct = (this.audio.currentTime / this.audio.duration) * 100;
    this.progressSlider.value = pct;
    this.progressFill.style.width = `${pct}%`;
    this.currentTimeEl.innerText = this.formatTime(this.audio.currentTime);

    // Sync Karaoke Lyrics
    if (this.lyricsData && this.lyricsData.synced && this.lyricsData.lines.length > 0) {
      const cur = this.audio.currentTime;
      let activeIdx = -1;
      for (let i = 0; i < this.lyricsData.lines.length; i++) {
        if (cur >= this.lyricsData.lines[i].time) {
          activeIdx = i;
        } else {
          break;
        }
      }
      if (activeIdx !== -1) {
        document.querySelectorAll('.lyric-line').forEach((el, idx) => {
          el.classList.toggle('active', idx === activeIdx);
          if (idx === activeIdx) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      }
    }
  }

  async loadLyrics(track) {
    const lyricsTitle = document.getElementById('lyrics-title');
    const lyricsArtist = document.getElementById('lyrics-artist');
    const lyricsThumb = document.getElementById('lyrics-thumb');
    
    if (lyricsTitle) lyricsTitle.innerText = track.title;
    if (lyricsArtist) lyricsArtist.innerText = track.artist || '';
    if (lyricsThumb) lyricsThumb.src = track.thumbnail || '/assets/avatars/music.svg';
    if (this.lyricsScroll) this.lyricsScroll.innerHTML = '<p class="lyrics-placeholder">Fetching synchronized lyrics...</p>';

    try {
      const res = await fetch(`/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}&duration=${track.duration_seconds || 0}`);
      const data = await res.json();
      this.lyricsData = data;

      if (this.lyricsScroll) {
        if (data.synced && data.lines.length > 0) {
          this.lyricsScroll.innerHTML = '';
          data.lines.forEach((line) => {
            const p = document.createElement('p');
            p.className = 'lyric-line';
            p.innerText = line.text || '♪';
            p.addEventListener('click', () => {
              this.audio.currentTime = line.time;
            });
            this.lyricsScroll.appendChild(p);
          });
        } else if (data.plain) {
          this.lyricsScroll.innerHTML = `<div style="white-space: pre-line; line-height: 1.8; font-size: 1.1rem; color: #fff;">${data.plain}</div>`;
        } else {
          this.lyricsScroll.innerHTML = '<p class="lyrics-placeholder">No lyrics available.</p>';
        }
      }

      if (this.cinemaOverlay && this.cinemaOverlay.classList.contains('active')) {
        this.renderCinemaLyrics();
      }
    } catch (e) {
      if (this.lyricsScroll) this.lyricsScroll.innerHTML = '<p class="lyrics-placeholder">Could not load lyrics.</p>';
    }
  }

  async fetchRadioUpNext(videoId) {
    try {
      const res = await fetch(`/api/up_next/${videoId}`);
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        if (this.queue.length <= 1) {
          this.queue.push(...data.tracks);
          this.renderQueue();
        }
      }
    } catch (e) {
      console.log('Up next fetch:', e);
    }
  }

  renderQueue() {
    if (!this.queueList) return;
    this.queueList.innerHTML = '';
    this.queue.forEach((track, idx) => {
      const item = document.createElement('div');
      item.className = `queue-item ${idx === this.currentIndex ? 'playing' : ''}`;
      item.style.cssText = `
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 18px;
        background: ${idx === this.currentIndex ? 'rgba(255, 13, 46, 0.12)' : 'var(--bg-surface)'};
        border-radius: var(--radius-md);
        border: 1px solid ${idx === this.currentIndex ? 'var(--primary)' : 'var(--border-glass)'};
        cursor: pointer;
        margin-bottom: 8px;
        box-shadow: var(--card-shadow);
      `;
      item.innerHTML = `
        <img src="${track.thumbnail || '/assets/avatars/music.svg'}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover;">
        <div style="flex: 1; overflow: hidden;">
          <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.title}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${track.artist || ''}</div>
        </div>
        <span class="material-symbols-rounded" style="color: ${idx === this.currentIndex ? 'var(--primary)' : 'var(--text-dim)'}">
          ${idx === this.currentIndex ? 'equalizer' : 'play_arrow'}
        </span>
      `;
      item.addEventListener('click', () => {
        this.currentIndex = idx;
        this.playTrack(track);
      });
      this.queueList.appendChild(item);
    });
  }

  updateNowPlayingUI(track) {
    if (!track) return;
    if (this.currentTitle) this.currentTitle.innerText = track.title;
    if (this.currentArtist) {
      this.currentArtist.innerText = track.artist || 'Cord Player';
      this.currentArtist.onclick = (e) => {
        e.stopPropagation();
        if (track.artist) this.openArtistProfile(track.artist);
      };
    }
    if (this.currentThumb) this.currentThumb.src = track.thumbnail || '/assets/avatars/music.svg';

    const isFav = this.favorites.some(f => f.id === track.id);
    if (this.likeBtn) {
      this.likeBtn.querySelector('span').innerText = isFav ? 'favorite' : 'favorite_border';
      this.likeBtn.classList.toggle('active', isFav);
    }

    const isDl = this.downloads.some(d => d.id === track.id);
    if (this.downloadBtn) {
      this.downloadBtn.querySelector('span').innerText = isDl ? 'offline_pin' : 'download';
      this.downloadBtn.classList.toggle('active', isDl);
    }
  }

  toggleFavorite() {
    if (!this.currentTrack) return;
    const idx = this.favorites.findIndex(f => f.id === this.currentTrack.id);
    if (idx >= 0) {
      this.favorites.splice(idx, 1);
    } else {
      this.favorites.push(this.currentTrack);
    }
    localStorage.setItem('cord_favorites', JSON.stringify(this.favorites));
    this.updateNowPlayingUI(this.currentTrack);
    this.renderFavorites();
  }

  renderFavorites() {
    if (this.favoritesGrid) {
      this.renderCards(this.favorites, this.favoritesGrid);
    }
  }

  renderRecentHistory() {
    if (this.recentHistoryGrid) {
      this.renderCards(this.history, this.recentHistoryGrid);
    }
  }

  trackHistory(track) {
    if (!track || !track.id) return;
    const existing = this.history.find(h => h.id === track.id);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.time = Date.now();
    } else {
      this.history.unshift({
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        count: 1,
        time: Date.now()
      });
    }
    if (this.history.length > 100) this.history.pop();
    localStorage.setItem('cord_history', JSON.stringify(this.history));
    this.renderRecentHistory();
  }

  async downloadCurrent() {
    if (!this.currentTrack) return;
    const btn = this.downloadBtn?.querySelector('span');
    if (btn) {
      btn.innerText = 'sync';
      btn.classList.add('spinning');
    }
    try {
      const q = document.getElementById('cfg-dl-quality')?.value || '320';
      const res = await fetch(`/api/download/${this.currentTrack.id}?title=${encodeURIComponent(this.currentTrack.title)}&artist=${encodeURIComponent(this.currentTrack.artist || '')}&thumbnail=${encodeURIComponent(this.currentTrack.thumbnail || '')}&quality=${q}`, { method: 'POST' });
      await res.json();
      if (btn) {
        btn.innerText = 'offline_pin';
        btn.classList.remove('spinning');
      }
      await this.loadDownloads();
      this.updateStorageInfo();
      this.updateNowPlayingUI(this.currentTrack);
    } catch (e) {
      if (btn) {
        btn.innerText = 'error';
        btn.classList.remove('spinning');
      }
    }
  }

  updateMediaSession(track) {
    if ('mediaSession' in navigator && track) {
      const art = track.thumbnail || '/assets/avatars/music.svg';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'Cord Player',
        album: track.album || 'Cord Music',
        artwork: [
          { src: art, sizes: '96x96', type: 'image/jpeg' },
          { src: art, sizes: '128x128', type: 'image/jpeg' },
          { src: art, sizes: '256x256', type: 'image/jpeg' },
          { src: art, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';

      if (this.audio.duration && !isNaN(this.audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: Math.max(0, this.audio.duration),
            playbackRate: this.audio.playbackRate || 1,
            position: Math.min(this.audio.currentTime, this.audio.duration)
          });
        } catch (e) {}
      }

      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && this.audio.duration) {
          this.audio.currentTime = details.seekTime;
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        this.audio.currentTime = Math.max(0, this.audio.currentTime - this.seekInterval);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + this.seekInterval);
      });
    }
  }

  // --- DISCORD RICH PRESENCE ---
  syncDiscordRPC() {
    if (!this.currentTrack) return;
    const enabled = document.getElementById('cfg-discord-enable')?.checked ?? true;
    if (!enabled) return;

    fetch('/api/discord_rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: this.currentTrack.title,
        artist: this.currentTrack.artist || '',
        duration: Math.round(this.audio.duration || 0),
        position: Math.round(this.audio.currentTime || 0),
        is_playing: this.isPlaying,
        thumbnail: this.currentTrack.thumbnail || ''
      })
    }).catch(e => console.log('RPC Sync:', e));
  }

  // --- WEBAUDIO GRAPH ---
  setupWebAudio() {
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return;
        this.audioCtx = new AudioCtxClass();
        this.source = this.audioCtx.createMediaElementSource(this.audio);
        
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = isNaN(this.volumeBoost) ? 1.0 : this.volumeBoost;
        
        let lastNode = this.source;
        this.eqFilters = this.eqFrequencies.map((freq, i) => {
          const filter = this.audioCtx.createBiquadFilter();
          filter.type = i === 0 ? 'lowshelf' : (i === this.eqFrequencies.length - 1 ? 'highshelf' : 'peaking');
          filter.frequency.value = freq;
          filter.Q.value = 1.4;
          filter.gain.value = 0;
          lastNode.connect(filter);
          lastNode = filter;
          return filter;
        });

        lastNode.connect(this.gainNode);

        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64;
        this.gainNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);

        this.applyEqPreset(this.eqPreset);
        this.drawVisualizer();
      }

      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    } catch (e) {
      console.log('WebAudio init note:', e);
    }
  }

  applyEqPreset(preset) {
    this.eqPreset = preset;
    this.settings.eqPreset = preset;
    this.saveSettings();
    const presets = {
      flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass_boost: [8, 6, 4, 2, 0, 0, 1, 2, 3, 4],
      vocal: [-2, -1, 1, 4, 6, 5, 3, 1, 0, 0],
      rock: [5, 4, 2, 0, -1, 1, 3, 5, 6, 6],
      pop: [-1, 2, 4, 5, 4, 2, 0, 2, 4, 4],
      electronic: [7, 6, 3, 0, -2, 2, 1, 4, 6, 7],
      classical: [5, 4, 3, 2, -1, -1, 0, 2, 4, 5]
    };

    const gains = presets[preset] || presets.flat;
    gains.forEach((g, i) => {
      const slider = document.getElementById(`eq-band-${i}`);
      const valText = document.getElementById(`eq-val-${i}`);
      if (slider) slider.value = g;
      if (valText) valText.innerText = `${g > 0 ? '+' : ''}${g}dB`;
      if (this.eqFilters[i]) this.eqFilters[i].gain.value = g;
    });
  }

  drawVisualizer() {
    requestAnimationFrame(() => this.drawVisualizer());
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const barWidth = (this.canvas.width / bufferLength) * 1.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * this.canvas.height;
        const grad = this.ctx.createLinearGradient(0, this.canvas.height, 0, 0);
        grad.addColorStop(0, '#FF0D2E');
        grad.addColorStop(1, '#FF4081');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(x, this.canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    }

    if (this.cinemaCtx && this.cinemaCanvas && this.cinemaOverlay && this.cinemaOverlay.classList.contains('active')) {
      this.cinemaCtx.clearRect(0, 0, this.cinemaCanvas.width, this.cinemaCanvas.height);
      const barWidth = (this.cinemaCanvas.width / bufferLength) * 1.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * this.cinemaCanvas.height;
        const grad = this.cinemaCtx.createLinearGradient(0, this.cinemaCanvas.height, 0, 0);
        grad.addColorStop(0, '#FF0D2E');
        grad.addColorStop(1, '#FFFFFF');
        this.cinemaCtx.fillStyle = grad;
        this.cinemaCtx.fillRect(x, this.cinemaCanvas.height - barHeight, barWidth - 3, barHeight);
        x += barWidth;
      }
    }
  }

  // --- WIDE-SCREEN CINEMA MODE ---
  openCinemaMode() {
    if (!this.currentTrack) return;
    this.cinemaOverlay.classList.add('active');
    this.cinemaThumb.src = this.currentTrack.thumbnail || '/assets/avatars/music.svg';
    this.cinemaTitle.innerText = this.currentTrack.title;
    this.cinemaArtist.innerText = this.currentTrack.artist || 'Cord Player';
    this.cinemaArtist.onclick = () => {
      this.closeCinemaMode();
      this.openArtistProfile(this.currentTrack.artist);
    };
    this.renderCinemaLyrics();
  }

  closeCinemaMode() {
    this.cinemaOverlay.classList.remove('active');
  }

  renderCinemaLyrics() {
    if (!this.lyricsData) {
      this.cinemaLyricsScroll.innerHTML = '<p class="lyrics-placeholder">Playing music...</p>';
      return;
    }
    if (this.lyricsData.synced && this.lyricsData.lines.length > 0) {
      this.cinemaLyricsScroll.innerHTML = '';
      this.lyricsData.lines.forEach((line) => {
        const p = document.createElement('p');
        p.className = 'lyric-line cinema-lyric-line';
        p.innerText = line.text || '♪';
        p.addEventListener('click', () => {
          this.audio.currentTime = line.time;
        });
        this.cinemaLyricsScroll.appendChild(p);
      });
    } else if (this.lyricsData.plain) {
      this.cinemaLyricsScroll.innerHTML = `<div style="white-space: pre-line; line-height: 2; font-size: 1.3rem; color: #fff;">${this.lyricsData.plain}</div>`;
    }
  }

  // --- THEME & STYLING ---
  applyThemeMode(mode) {
    this.themeMode = mode;
    this.settings.themeMode = mode;
    this.saveSettings();

    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('theme-dark', isDark);

    const icon = document.getElementById('theme-mode-icon');
    const label = document.getElementById('theme-mode-label');
    if (icon) icon.innerText = isDark ? 'light_mode' : 'dark_mode';
    if (label) label.innerText = isDark ? 'Light' : 'Dark';
  }

  applyTheme(themeName) {
    this.theme = themeName;
    this.settings.theme = themeName;
    this.saveSettings();
    
    document.body.classList.remove('theme-red-white', 'theme-black-white', 'theme-violet-white', 'theme-cyan-white', 'theme-custom');
    
    if (themeName === 'custom') {
      this.applyCustomTheme(this.customThemeData);
    } else {
      document.body.classList.add(`theme-${themeName}`);
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-gradient');
      document.documentElement.style.removeProperty('--primary-glow');
    }
  }

  applyCustomTheme(data) {
    document.body.classList.add('theme-custom');
    const c1 = data.c1 || '#FF0D2E';
    const c2 = data.c2 || '#FFFFFF';
    const angle = data.angle || 135;
    const gradient = data.grad ? `linear-gradient(${angle}deg, ${c1}, ${c2})` : c1;

    document.documentElement.style.setProperty('--primary', c1);
    document.documentElement.style.setProperty('--primary-gradient', gradient);
    document.documentElement.style.setProperty('--primary-glow', `${c1}66`);
    this.settings.theme = 'custom';
    this.saveSettings();
  }

  applyBorderRadius(val) {
    this.settings.borderRadius = val;
    this.saveSettings();
    document.body.classList.remove('radius-pill', 'radius-standard', 'radius-sharp');
    document.body.classList.add(`radius-${val}`);
    const select = document.getElementById('cfg-border-radius');
    if (select) select.value = val;
  }

  applyBackgroundStyle(style) {
    this.settings.bgStyle = style;
    this.saveSettings();
    document.body.classList.toggle('bg-solid', style === 'solid');
    document.body.classList.toggle('bg-dynamic', style !== 'solid');
    const select = document.getElementById('cfg-bg-style');
    if (select) select.value = style;
  }

  toggleSidebarVisualizer(enabled) {
    this.settings.showViz = enabled;
    this.saveSettings();
    document.body.classList.toggle('hide-side-viz', !enabled);
    const toggle = document.getElementById('cfg-viz-toggle');
    if (toggle) toggle.checked = enabled;
  }

  initCustomColorStudio() {
    const palette = [
      { name: 'Crimson Red', hex: '#FF0D2E' },
      { name: 'Ruby Pink', hex: '#E91E63' },
      { name: 'Neon Purple', hex: '#E040FB' },
      { name: 'Electric Violet', hex: '#7C4DFF' },
      { name: 'Deep Indigo', hex: '#3F51B5' },
      { name: 'Electric Blue', hex: '#2979FF' },
      { name: 'Cyberpunk Cyan', hex: '#00B0FF' },
      { name: 'Teal Aura', hex: '#00BFA5' },
      { name: 'Emerald Green', hex: '#00E676' },
      { name: 'Lime Pulse', hex: '#AEEA00' },
      { name: 'Amber Gold', hex: '#FFC400' },
      { name: 'Sunset Orange', hex: '#FF9100' },
      { name: 'Flame Red', hex: '#FF3D00' },
      { name: 'Onyx Black', hex: '#18181B' },
      { name: 'Pure White', hex: '#FFFFFF' }
    ];

    const pGrid = document.getElementById('primary-swatches-grid');
    const sGrid = document.getElementById('secondary-swatches-grid');
    const hex1 = document.getElementById('hex-text-1');
    const hex2 = document.getElementById('hex-text-2');
    const ind1 = document.getElementById('primary-indicator');
    const ind2 = document.getElementById('secondary-indicator');
    const previewBox = document.getElementById('custom-theme-preview');
    const angleSlider = document.getElementById('custom-gradient-angle');
    const gradToggle = document.getElementById('custom-gradient-toggle');

    const updatePreview = () => {
      const c1 = hex1 ? hex1.value : '#FF0D2E';
      const c2 = hex2 ? hex2.value : '#FFFFFF';
      const grad = gradToggle ? gradToggle.checked : true;
      const angle = angleSlider ? angleSlider.value : 135;

      if (ind1) ind1.style.background = c1;
      if (ind2) ind2.style.background = c2;
      if (previewBox) {
        previewBox.style.background = grad ? `linear-gradient(${angle}deg, ${c1}, ${c2})` : c1;
        previewBox.style.boxShadow = `0 10px 28px ${c1}66`;
      }
    };

    if (pGrid) {
      pGrid.innerHTML = '';
      palette.forEach(color => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `studio-swatch ${hex1 && hex1.value.toLowerCase() === color.hex.toLowerCase() ? 'active' : ''}`;
        btn.style.background = color.hex;
        btn.title = color.name;
        btn.addEventListener('click', () => {
          if (hex1) hex1.value = color.hex;
          pGrid.querySelectorAll('.studio-swatch').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          updatePreview();
        });
        pGrid.appendChild(btn);
      });
    }

    if (sGrid) {
      sGrid.innerHTML = '';
      palette.forEach(color => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `studio-swatch ${hex2 && hex2.value.toLowerCase() === color.hex.toLowerCase() ? 'active' : ''}`;
        btn.style.background = color.hex;
        btn.title = color.name;
        btn.addEventListener('click', () => {
          if (hex2) hex2.value = color.hex;
          sGrid.querySelectorAll('.studio-swatch').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          updatePreview();
        });
        sGrid.appendChild(btn);
      });
    }

    hex1?.addEventListener('input', () => {
      if (hex1.value.startsWith('#') && hex1.value.length === 7) updatePreview();
    });
    hex2?.addEventListener('input', () => {
      if (hex2.value.startsWith('#') && hex2.value.length === 7) updatePreview();
    });
    gradToggle?.addEventListener('change', updatePreview);
    angleSlider?.addEventListener('input', (e) => {
      const angleText = document.getElementById('angle-val-text');
      if (angleText) angleText.innerText = `${e.target.value}°`;
      updatePreview();
    });

    updatePreview();
  }

  // --- AUDIO DEVICES & STORAGE ---
  async initAudioDevices() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        const select = document.getElementById('cfg-output-sink');
        if (select && audioOutputs.length > 0) {
          select.innerHTML = '<option value="default">Default System Audio</option>';
          audioOutputs.forEach(dev => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.innerText = dev.label || `Audio Sink (${dev.deviceId.slice(0, 5)})`;
            select.appendChild(opt);
          });
          select.addEventListener('change', async (e) => {
            if (this.audio.setSinkId) {
              await this.audio.setSinkId(e.target.value);
            }
          });
        }
      } catch (e) {
        console.log('Audio devices note:', e);
      }
    }
  }

  async updateStorageInfo() {
    try {
      const res = await fetch('/api/system/storage_info');
      const data = await res.json();
      const badge = document.getElementById('storage-usage-badge');
      const desc = document.getElementById('storage-usage-desc');
      if (badge) badge.innerText = `${data.download_size_mb} MB`;
      if (desc) desc.innerText = `${data.download_count} songs saved offline in ~/Music/Cord/`;
    } catch (e) {
      console.log('Storage info note:', e);
    }
  }

  // --- SHORTCUTS & SESSION ---
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.ctrlKey) this.playNext();
          else if (this.audio.duration) this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + this.seekInterval);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.ctrlKey) this.playPrevious();
          else if (this.audio.duration) this.audio.currentTime = Math.max(0, this.audio.currentTime - this.seekInterval);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.audio.volume = Math.min(1.0, this.audio.volume + 0.05);
          this.volumeSlider.value = this.audio.volume;
          this.updateVolumeIcon(this.audio.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.audio.volume = Math.max(0.0, this.audio.volume - 0.05);
          this.volumeSlider.value = this.audio.volume;
          this.updateVolumeIcon(this.audio.volume);
          break;
        case 'KeyM':
          this.audio.muted = !this.audio.muted;
          this.volumeIcon.innerText = this.audio.muted ? 'volume_off' : 'volume_up';
          break;
        case 'KeyS':
          this.isShuffle = !this.isShuffle;
          this.shuffleBtn.classList.toggle('active', this.isShuffle);
          break;
        case 'KeyR':
          this.repeatBtn.click();
          break;
        case 'KeyF':
          this.openCinemaMode();
          break;
        case 'Slash':
          e.preventDefault();
          this.switchTab('search');
          this.searchInput.focus();
          break;
        case 'Escape':
          this.closeCinemaMode();
          this.closeContextMenu();
          this.hideSuggestions();
          break;
      }
    });
  }

  saveSession() {
    if (!this.currentTrack) return;
    const session = {
      track: this.currentTrack,
      queue: this.queue,
      time: this.audio.currentTime,
      volume: this.audio.volume
    };
    localStorage.setItem('cord_last_session', JSON.stringify(session));
  }

  restoreSession() {
    const raw = localStorage.getItem('cord_last_session');
    if (!raw) return;
    try {
      const session = JSON.parse(raw);
      if (session.track && session.track.id) {
        this.currentTrack = session.track;
        this.queue = session.queue || [session.track];
        this.currentIndex = 0;
        this.updateNowPlayingUI(session.track);
        this.renderQueue();
        this.audio.src = `/api/audio/${session.track.id}`;
        this.audio.load();
      }
    } catch (e) {
      console.log('Session restore note:', e);
    }
  }

  updateVolumeIcon(vol) {
    if (vol == 0) this.volumeIcon.innerText = 'volume_off';
    else if (vol < 0.5) this.volumeIcon.innerText = 'volume_down';
    else this.volumeIcon.innerText = 'volume_up';
  }

  formatTime(sec) {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}

// Robust instantiation regardless of script load timing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.player = new CordPlayer();
  });
} else {
  window.player = new CordPlayer();
}
