/**
 * File Manager service to open native OS file pickers & file managers
 * Uses the modern File System Access API (showOpenFilePicker) with fallback to file input.
 */

export interface OpenFileManagerOptions {
  multiple?: boolean;
  acceptTypes?: string[];
}

const DEFAULT_AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  '.opus',
  '.webm',
  '.wma',
];

export async function openAudioFileManager(
  options: OpenFileManagerOptions = { multiple: true }
): Promise<File[]> {
  const multiple = options.multiple ?? true;

  // 1. Try modern File System Access API if supported (Chrome, Edge, Opera, Android Chrome)
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      // @ts-expect-error File System Access API
      const handles: FileSystemFileHandle[] = await window.showOpenFilePicker({
        multiple,
        types: [
          {
            description: 'Audio Files (*.mp3, *.wav, *.m4a, *.aac, *.flac, *.ogg, *.opus)',
            accept: {
              'audio/*': DEFAULT_AUDIO_EXTENSIONS,
            },
          },
        ],
      });

      const files: File[] = [];
      for (const handle of handles) {
        try {
          const file = await handle.getFile();
          files.push(file);
        } catch (e) {
          console.warn('Failed reading file from handle:', e);
        }
      }

      if (files.length > 0) {
        return files;
      }
    } catch (err: unknown) {
      // User cancelled picker or permission rejected
      if (err instanceof Error && err.name === 'AbortError') {
        return [];
      }
      console.warn('showOpenFilePicker failed, falling back to input element:', err);
    }
  }

  // 2. Robust fallback for Safari, Firefox, iOS, and WebViews using dynamic input element
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = 'audio/*,' + DEFAULT_AUDIO_EXTENSIONS.join(',');
    input.style.display = 'none';

    let resolved = false;

    const cleanup = () => {
      window.removeEventListener('focus', onFocusCheck);
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    const handleChange = () => {
      if (resolved) return;
      resolved = true;
      const fileList = input.files;
      const files = fileList ? Array.from(fileList) : [];
      cleanup();
      resolve(files);
    };

    const onFocusCheck = () => {
      // Fallback timeout in case user cancels the native file manager dialog
      setTimeout(() => {
        if (!resolved && (!input.files || input.files.length === 0)) {
          resolved = true;
          cleanup();
          resolve([]);
        }
      }, 800);
    };

    input.addEventListener('change', handleChange, { once: true });
    window.addEventListener('focus', onFocusCheck, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}
