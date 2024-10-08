import { error, Stack } from '@pnotify/core';
import { HasteDocument } from './HasteDocument.js';
import type { Button } from './types.js';
import { selectElement } from './utils.js';

/**
 * Represents a Haste object that handles document creation, loading, and saving.
 */
export class Haste {
	private appName = 'Hastebin';
	private textArea = selectElement<HTMLTextAreaElement>('textarea');
	private box = selectElement('#box');
	private code = selectElement('#box code');
	private doc: HasteDocument | null = null;
	private buttons: Button[] = [
		{
			where: selectElement('#box2 .save'),
			label: 'Save',
			shortcutDescription: 'Control Or Command + s',
			shortcut: (evt) => (evt.ctrlKey || evt.metaKey) && evt.key === 's',
			action: async () => {
				const textAreaValue = this.textArea.value;
				if (textAreaValue && textAreaValue.replaceAll(/^\s+$/g, '') !== '') {
					await this.saveDocument();
				}
			}
		},
		{
			where: selectElement('#box2 .new'),
			label: 'New',
			shortcutDescription: 'Control Or Command + n',
			shortcut: (evt) => (evt.ctrlKey || evt.metaKey) && evt.key === 'n',
			action: () => {
				this.newDocument();
				this.pushRouteState();
			}
		},
		{
			where: selectElement('#box2 .duplicate'),
			label: 'Duplicate & Edit',
			shortcutDescription: 'Control Or Command + d',
			shortcut: (evt) => Boolean(this.doc?.locked) && (evt.ctrlKey || evt.metaKey) && evt.key === 'd',
			action: () => this.duplicateDocument()
		},
		{
			where: selectElement('#box2 .raw'),
			label: 'Just Text',
			shortcutDescription: 'Control Or Command + Shift + r',
			shortcut: (evt) => (evt.ctrlKey || evt.metaKey) && evt.shiftKey && evt.key === 'r',
			action: () =>
				this.doc?.key
					? window.location.assign(`${window.location.origin}/raw/${this.doc.key}`)
					: window.location.replace(window.location.href)
		}
	];

	/**
	 * pnotify messages stack positioned at the bottom left corner
	 */
	private messageStack = new Stack({
		dir1: 'up',
		dir2: 'right',
		firstpos1: 10,
		firstpos2: 10
	});

	/**
	 * Map of common extensions
	 *
	 * @remark this list does not need to include anything is its own extension
	 * due to the behavior of {@link lookupTypeByExtension} and {@link lookupExtensionByType}.
	 *
	 * @remark Optimized for {@link lookupTypeByExtension}
	 */
	private extensionsMap = new Map([
		['bash', 'bash'],
		['cc', 'cpp'],
		['cpp', 'cpp'],
		['css', 'css'],
		['diff', 'diff'],
		['go', 'go'],
		['htm', 'xml'],
		['html', 'xml'],
		['ini', 'ini'],
		['java', 'java'],
		['json', 'json'],
		['less', 'less'],
		['md', 'markdown'],
		['nginx', 'nginx'],
		['php', 'php'],
		['powershell', 'ps1'],
		['properties', 'properties'],
		['py', 'python'],
		['sh', 'bash'],
		['sql', 'sql'],
		['swift', 'swift'],
		['tex', 'tex'],
		['ts', 'typescript'],
		['txt', ''],
		['xml', 'xml']
	]);

	public constructor(appName: string) {
		this.appName = appName;

		this.configureShortcuts();

		for (const button of this.buttons) {
			this.configureButton(button);
		}

		this.configureAboutDocumentRoute();
	}

	/**
	 * Creates a new document in the Haste application.
	 *
	 * This method hides the box, creates a new {@link HasteDocument} instance,
	 * updates the browser history, sets the title, enables the buttons,
	 * clears the text area, displays the text area, sets focus to the text area,
	 * and removes line numbers.
	 */
	public newDocument() {
		this.box.style.display = 'none';
		this.doc = new HasteDocument();

		this.setTitle();
		this.setButtonsEnabled(true);
		this.textArea.value = '';
		this.textArea.style.display = '';
		this.textArea.focus();
		this.removeLineNumbers();
	}

	public pushRouteState() {
		window.history.pushState(null, this.appName, '/');
	}

	/**
	 * Loads a document and shows it
	 * @param url The url of the document to load
	 */
	public async loadDocument(url: string) {
		const parts = url.split('.', 2);
		this.doc = new HasteDocument();
		try {
			const ret = await this.doc.load(parts[0], this.lookupTypeByExtension(parts[1]));
			this.code.innerHTML = ret.value;
			this.setTitle(ret.key);
			this.setButtonsEnabled(false);
			this.textArea.value = '';
			this.textArea.style.display = 'none';
			this.box.style.display = '';
			this.box.focus();
			this.addLineNumbers(ret.lineCount);
		} catch {
			this.newDocument();
			this.pushRouteState();
		}
	}

	private configureAboutDocumentRoute() {
		const logoElement = document.getElementById('logo');
		if (logoElement) {
			logoElement.addEventListener('click', (event) => {
				event.preventDefault();

				window.history.pushState(null, this.appName, '/about.md');
				return this.loadDocument('about.md');
			});
		}
	}

	/**
	 * Duplicate the current document - only if locked
	 */
	private duplicateDocument() {
		if (this.doc?.locked && this.doc.data) {
			const currentData = this.doc.data;
			this.newDocument();
			this.pushRouteState();
			this.textArea.value = currentData;
		}
	}

	/**
	 * Saves the current document to the database
	 */
	private async saveDocument() {
		const textAreaValue = this.textArea.value;
		if (this.doc && textAreaValue) {
			try {
				const returnedDocument = await this.doc.save(textAreaValue);

				if (returnedDocument) {
					this.code.innerHTML = returnedDocument.value;
					this.setTitle(returnedDocument.key);
					let file = `/${returnedDocument.key}`;
					if (returnedDocument.language) {
						file += `.${this.lookupExtensionByType(returnedDocument.language)}`;
					}
					if (this.doc) {
						this.doc.key = returnedDocument.key;
					}
					window.history.pushState(null, `${this.appName}-${returnedDocument.key}`, file);
					this.setButtonsEnabled(false);
					this.textArea.value = '';
					this.textArea.style.display = 'none';
					this.box.style.display = '';
					this.box.focus();
					this.addLineNumbers(returnedDocument.lineCount);
				}
			} catch (err) {
				const typedError = err as Error;
				this.showMessage(typedError.message);
			}
		}
	}

	/**
	 * Sets the page title
	 * @param ext The extension to add to the page title
	 */
	private setTitle(ext?: string) {
		const title = ext ? `${this.appName} - ${ext}` : this.appName;
		document.title = title;
	}

	/**
	 * Enables the buttons when viewing an existing document
	 */
	private setButtonsEnabled(newDocument: boolean) {
		for (const button of ['duplicate', 'raw']) {
			if (newDocument) {
				selectElement(`#box2 .function.${button}`).classList.remove('enabled');
			} else {
				selectElement(`#box2 .function.${button}`).classList.add('enabled');
			}
		}

		if (newDocument) {
			selectElement('#box2 .function.save').classList.add('enabled');
		} else {
			selectElement('#box2 .function.save').classList.remove('enabled');
		}
	}

	/**
	 * Looks up extension preferred for a given type.
	 * If none is found then the type itself is returned - which we'll use as the extension
	 * @param type The extension type to look up
	 */
	private lookupExtensionByType(type: string) {
		for (const [key, value] of this.extensionsMap.entries()) {
			if (value === type) return key;
		}

		return type;
	}

	/**
	 * Look up the type for a given extension
	 * If none is found then the extension itself is returned - which we'll use as the extension
	 * @param ext The extension to look up
	 */
	private lookupTypeByExtension(ext: string) {
		return this.extensionsMap.get(ext) ?? ext;
	}

	/**
	 * Adds the line numbers to the view
	 */
	private addLineNumbers(lineCount: number) {
		let numbers = '';

		for (let i = 0; i < lineCount; i++) {
			numbers += `${(i + 1).toString()}<br/>`;
		}

		selectElement('#linenos').innerHTML = numbers;
	}

	/**
	 * Removes the line numbers from view
	 */
	private removeLineNumbers() {
		selectElement('#linenos').innerHTML = '&gt;';
	}

	/**
	 * Configures a button
	 */
	private configureButton(button: Button) {
		button.where.onclick = async (event) => {
			event.preventDefault();

			if (!button.clickDisabled && button.where.classList.contains('enabled')) {
				await button.action();
			}
		};

		button.where.onmouseenter = () => {
			selectElement('#box3 .label').textContent = button.label;
			selectElement('#box3 .shortcut').textContent = button.shortcutDescription || '';
			selectElement('#box3').style.display = 'block';
		};

		button.where.onmouseleave = () => {
			selectElement('#box3').style.display = 'none';
		};
	}

	/**
	 * Configures keyboard shortcuts for all buttons
	 */
	private configureShortcuts() {
		document.body.onkeydown = async (event) => {
			for (const button of this.buttons) {
				if (button.shortcut(event)) {
					event.preventDefault();
					await button.action();
					break;
				}
			}
		};
	}

	private showMessage(message: string) {
		error({
			text: message,
			type: 'error',
			styling: 'material',
			icons: 'material',
			mode: 'dark',
			animateSpeed: 'normal',
			delay: 3000,
			stack: this.messageStack
		});
	}
}
