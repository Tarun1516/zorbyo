import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, ActivityIndicator, Platform, Dimensions, PanResponder } from 'react-native';
import { Video, AVPlaybackStatus, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';

interface RestrictedVideoPlayerProps {
  source: { uri: string };
  initialPositionMillis?: number;
  onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
  onLoad?: (status: AVPlaybackStatus) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

const isFormatSupported = (uri: string): boolean => {
  const lower = uri.toLowerCase();
  const supported = ['.mp4', '.m4v', '.mov'];
  const androidSupported = ['.avi', '.mkv', '.webm', '.3gp'];
  
  for (const ext of supported) {
    if (lower.includes(ext)) return true;
  }
  if (Platform.OS === 'android') {
    for (const ext of androidSupported) {
      if (lower.includes(ext)) return true;
    }
  }
  return false;
};

export default function RestrictedVideoPlayer({
  source,
  initialPositionMillis = 0,
  onPlaybackStatusUpdate,
  onLoad,
  onComplete,
  onError,
}: RestrictedVideoPlayerProps) {
  const videoRef = useRef<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));

  const furthestPositionRef = useRef(0);
  const lastValidPositionRef = useRef(0);
  const initialPositionSetRef = useRef(false);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef(0);

  // Listen for dimension changes (rotation)
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = durationMillis > 0 ? (positionMillis / durationMillis) * 100 : 0;

  const showControlsTemporarily = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      showControlsTemporarily();
    } else {
      setShowControls(true);
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    }
  }, [isPlaying, showControlsTemporarily]);

  // Toggle fullscreen/landscape mode
  const toggleFullscreen = useCallback(async () => {
    try {
      if (isFullscreen) {
        // Exit fullscreen - try to lock to portrait
        if (Platform.OS !== 'web') {
          try {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          } catch (err) {
            console.warn('Screen orientation lock failed:', err);
          }
        }
        setIsFullscreen(false);
      } else {
        // Enter fullscreen - try to lock to landscape
        if (Platform.OS !== 'web') {
          try {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          } catch (err) {
            console.warn('Screen orientation lock failed:', err);
          }
        }
        setIsFullscreen(true);
      }
      showControlsTemporarily();
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error);
      // Still toggle the state even if orientation lock fails
      setIsFullscreen(!isFullscreen);
    }
  }, [isFullscreen, showControlsTemporarily]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, []);

  const handlePlaybackStatusUpdate = useCallback(
    async (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if ('error' in status && status.error) {
          setHasError(true);
          setErrorMessage(status.error);
          setIsLoading(false);
          onError?.(status.error);
        } else {
          setIsLoading(true);
        }
        return;
      }

      setHasError(false);
      setErrorMessage('');
      setIsLoading(false);
      setIsPlaying(status.isPlaying);
      setIsBuffering(status.isBuffering || false);

      const currentPosition = status.positionMillis || 0;
      const duration = status.durationMillis || 0;

      setDurationMillis(duration);

      const positionDelta = currentPosition - lastValidPositionRef.current;
      const isSeekForward = positionDelta > 2500;
      const isSeekBackward = currentPosition < lastValidPositionRef.current - 500;

      if ((isSeekForward || isSeekBackward) && status.isPlaying) {
        await videoRef.current?.setPositionAsync(lastValidPositionRef.current);
        setPositionMillis(lastValidPositionRef.current);
        return;
      }

      if (!isSeekForward && !isSeekBackward) {
        lastValidPositionRef.current = currentPosition;
        furthestPositionRef.current = Math.max(furthestPositionRef.current, currentPosition);
      }

      setPositionMillis(currentPosition);
      onPlaybackStatusUpdate?.(status);

      if (status.didJustFinish) {
        setIsPlaying(false);
        onComplete?.();
      }
    },
    [onPlaybackStatusUpdate, onComplete, onError]
  );

  const handleLoad = useCallback(
    (status: AVPlaybackStatus) => {
      if (status.isLoaded) {
        setIsLoading(false);
        setDurationMillis(status.durationMillis || 0);

        // Restore position if provided
        if (initialPositionMillis > 0 && !initialPositionSetRef.current) {
          videoRef.current?.setPositionAsync(initialPositionMillis);
          lastValidPositionRef.current = initialPositionMillis;
          furthestPositionRef.current = initialPositionMillis;
          setPositionMillis(initialPositionMillis);
          initialPositionSetRef.current = true;
        } else if (initialPositionSetRef.current === false) {
          initialPositionSetRef.current = true;
        }

        onLoad?.(status);
      }
    },
    [initialPositionMillis, onLoad]
  );

  const handleError = useCallback((error: string) => {
    setHasError(true);
    setErrorMessage(error);
    setIsLoading(false);
    onError?.(error);
  }, [onError]);

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current || hasError) return;
    showControlsTemporarily();
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [isPlaying, hasError, showControlsTemporarily]);

  // Handle tap - single tap shows controls, double tap toggles play/pause
  const handleTap = useCallback(async () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY) {
      // Double tap - toggle play/pause
      await togglePlayPause();
    } else {
      // Single tap - show controls
      showControlsTemporarily();
    }
    lastTapTimeRef.current = now;
  }, [togglePlayPause, showControlsTemporarily]);

  // Seek to position when tapping/dragging on progress bar
  const progressBarRef = useRef<View | null>(null);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const handleProgressBarLayout = useCallback((event: any) => {
    const { width } = event.nativeEvent.layout;
    setProgressBarWidth(width);
  }, []);

  const seekToPosition = useCallback(async (locationX: number) => {
    if (!videoRef.current || durationMillis <= 0 || progressBarWidth <= 0) return;
    
    const seekPercent = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const seekPosition = Math.floor(seekPercent * durationMillis);
    
    // Only allow seeking within the watched portion
    const maxSeekPosition = furthestPositionRef.current;
    const finalPosition = Math.min(seekPosition, maxSeekPosition);
    
    await videoRef.current.setPositionAsync(finalPosition);
    setPositionMillis(finalPosition);
    lastValidPositionRef.current = finalPosition;
    showControlsTemporarily();
  }, [durationMillis, progressBarWidth, showControlsTemporarily]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        seekToPosition(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        seekToPosition(evt.nativeEvent.locationX);
      },
    })
  ).current;

  useEffect(() => {
    furthestPositionRef.current = 0;
    lastValidPositionRef.current = 0;
    initialPositionSetRef.current = false;
    setPositionMillis(0);
    setHasError(false);
    setErrorMessage('');
    setIsLoading(true);
  }, [source.uri]);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, []);

  const videoSource = {
    uri: source.uri,
    overrideFileExtensionAndroid: source.uri.includes('.mkv') ? 'mkv' : undefined,
  };

  const formatSupported = isFormatSupported(source.uri);

  // Calculate dimensions based on device screen
  const { width: screenWidth, height: screenHeight } = screenDimensions;
  
  // In portrait: use full width, height = width * (9/16)
  // In fullscreen: use full screen dimensions
  const containerWidth = screenWidth;
  const containerHeight = isFullscreen ? screenHeight : screenWidth * (9 / 16);

  return (
    <View style={[
      styles.container,
      isFullscreen && styles.fullscreenContainer,
      { width: containerWidth, height: containerHeight }
    ]}>
      <Video
        ref={videoRef}
        style={styles.video}
        source={videoSource}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onLoad={handleLoad}
        onError={handleError}
        useNativeControls={false}
      />

      {/* Touch overlay - handles single tap and double tap */}
      <TouchableOpacity
        style={styles.touchOverlay}
        activeOpacity={1}
        onPress={handleTap}
      >
        {/* Error overlay */}
        {hasError && (
          <View style={styles.errorOverlay}>
            <Ionicons name="alert-circle" size={48} color="#E5493D" />
            <Text style={styles.errorTitle}>Video Error</Text>
            <Text style={styles.errorText}>{errorMessage || 'Unable to load video.'}</Text>
            {!formatSupported && (
              <Text style={styles.errorHint}>
                Best support: MP4, MOV, M4V
                {Platform.OS === 'android' ? ', AVI, MKV' : ''}
              </Text>
            )}
          </View>
        )}

        {/* Loading overlay */}
        {(isLoading || isBuffering) && !hasError && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#E5493D" />
            <Text style={styles.loadingText}>
              {isBuffering ? 'Buffering...' : 'Loading video...'}
            </Text>
          </View>
        )}

        {/* Play/Pause button - center, visible when controls show */}
        {!isLoading && !isBuffering && !hasError && showControls && (
          <TouchableOpacity
            style={styles.playPauseButton}
            onPress={togglePlayPause}
            activeOpacity={0.7}
          >
            <View style={styles.playPauseIconContainer}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={36}
                color="#FFFFFF"
              />
            </View>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Rotate/Fullscreen button - always visible in top right */}
      <TouchableOpacity
        style={styles.rotateButton}
        onPress={toggleFullscreen}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isFullscreen ? 'contract' : 'expand'}
          size={20}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Bottom controls bar */}
      <View style={styles.controlsBar}>
        <View 
          ref={progressBarRef}
          style={styles.progressBarContainer}
          onLayout={handleProgressBarLayout}
          {...panResponder.panHandlers}
        >
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            {/* Watched progress indicator */}
            <View style={[styles.progressBarWatched, { width: `${(furthestPositionRef.current / durationMillis) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(positionMillis)}</Text>
          <Text style={styles.timeText}>{formatTime(durationMillis)}</Text>
        </View>
        {!isFullscreen && (
          <Text style={styles.hintText}>
            Double-tap to play/pause
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  touchOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 10,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  playPauseButton: {
    padding: 16,
  },
  playPauseIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(229, 73, 61, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotateButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 10,
    paddingTop: 5,
    paddingBottom: 6,
    zIndex: 20,
  },
  progressBarContainer: {
    marginBottom: 3,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E5493D',
    borderRadius: 2,
  },
  progressBarWatched: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: 'rgba(229, 73, 61, 0.3)',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timeText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
  },
  hintText: {
    color: '#FFA726',
    fontSize: 9,
    fontFamily: 'Geist_400Regular',
    textAlign: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    color: '#E5493D',
    fontSize: 16,
    fontFamily: 'Geist_700Bold',
    marginTop: 10,
  },
  errorText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  errorHint: {
    color: '#999',
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
});
