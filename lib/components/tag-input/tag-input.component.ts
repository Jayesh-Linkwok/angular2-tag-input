import {
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALUE_ACCESSOR, FormBuilder, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';

import { KEYS } from '../../shared/tag-input-keys';

/**
 * Taken from @angular/common/src/facade/lang
 */
function isBlank(obj: any): boolean {
  return obj === undefined || obj === null;
}

export interface AutoCompleteItem {
  [index: string]: any;
}

@Component({
  selector: 'rl-tag-input',
  template: `
    <rl-tag-input-item
      [text]="tag"
      [index]="index"
      [displayBy]="displayBy"
      [selected]="selectedTag === index"
      (tagRemoved)="_removeTag($event)"
      *ngFor="let tag of tagsList; let index = index">
    </rl-tag-input-item>
    <form [formGroup]="tagInputForm" class="ng2-tag-input-form">
      <input
        class="ng2-tag-input-field"
        type="text"
        #tagInputElement
        formControlName="tagInputField"
        [placeholder]="placeholder"
        (paste)="onInputPaste($event)"
        (keydown)="onKeydown($event)"
        (blur)="onInputBlurred($event)"
        (click)="onInputClicked()"
        (focus)="onInputFocused()">

      <div *ngIf="showAutocomplete()" class="rl-tag-input-autocomplete-container">
        <rl-tag-input-autocomplete 
          [displayBy]="displayBy"
          [items]="autocompleteResults"
          [selectFirstItem]="autocompleteSelectFirstItem"
          (itemSelected)="onAutocompleteSelect($event)"
          (enterPressed)="onAutocompleteEnter($event)">
        </rl-tag-input-autocomplete>
      </div>
    </form>
  `,
  styles: [`
    :host {
      font-family: "Roboto", "Helvetica Neue", sans-serif;
      font-size: 16px;
      display: block;
      box-shadow: 0 1px #ccc;
      padding: 8px 0 6px 0;
      will-change: box-shadow;
      transition: box-shadow 0.12s ease-out;
    }

     :host .ng2-tag-input-form {
      display: inline;
    }

     :host .ng2-tag-input-field {
      font-family: "Roboto", "Helvetica Neue", sans-serif;
      font-size: 16px;
      display: inline-block;
      width: auto;
      box-shadow: none;
      border: 0;
      padding: 8px 0;
    }

     :host .ng2-tag-input-field:focus {
      outline: 0;
    }

     :host .rl-tag-input-autocomplete-container {
      position: relative;
      z-index: 10;
    }

    :host.ng2-tag-input-focus {
      box-shadow: 0 2px #0d8bff;
    }
  `],
  providers: [
    {provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TagInputComponent), multi: true},
  ]
})
export class TagInputComponent implements ControlValueAccessor, OnDestroy, OnInit {
  @HostBinding('class.ng2-tag-input-focus') isFocused;
  @Input() addOnBlur: boolean = true;
  @Input() addOnComma: boolean = true;
  @Input() addOnEnter: boolean = true;
  @Input() addOnPaste: boolean = true;
  @Input() addOnSpace: boolean = false;
  @Input() allowDuplicates: boolean = false;
  @Input() allowedTagsPattern: RegExp = /.+/;
  @Input() autocomplete: boolean = false;
  @Input() autocompleteItems: any[] = [];
  @Input() autocompleteItemsCallback: (term: string) => Promise<any> = null;
  @Input() autocompleteDebounceTime: number = 0;
  @Input() autocompleteMustMatch: boolean = true;
  @Input() autocompleteSelectFirstItem: boolean = true;
  @Input() autocompleteMaxItems: number = 10;
  @Input() minSearchTermLength: number = 1;
  @Input() pasteSplitPattern: string = ',';
  @Input() placeholder: string = 'Add a tag';
  @Input() displayBy = 'name';
  @Output('addTag') addTag: EventEmitter<any> = new EventEmitter<any>();
  @Output('removeTag') removeTag: EventEmitter<any> = new EventEmitter<any>();
  @ViewChild('tagInputElement') tagInputElement: ElementRef;

  private canShowAutoComplete: boolean = false;
  private tagInputSubscription: Subscription;
  private splitRegExp: RegExp;
  private get tagInputField(): AbstractControl {
    return this.tagInputForm.get('tagInputField');
  }
  private get inputValue(): string {
    return this.tagInputField.value;
  }

  public tagInputForm: FormGroup;
  public autocompleteResults: string[] = [];
  public tagsList: any[] = [];
  public selectedTag: number;

  @HostListener('document:click', ['$event', '$event.target']) onDocumentClick(event: MouseEvent, target: HTMLElement) {
    if (!target) {
      return;
    }

    if (!this.elementRef.nativeElement.contains(target)) {
      this.canShowAutoComplete = false;
    }
  }

  constructor(
    private fb: FormBuilder,
    private elementRef: ElementRef) {}

  ngOnInit() {
    this.splitRegExp = new RegExp(this.pasteSplitPattern);

    this.tagInputForm = this.fb.group({
      tagInputField: ''
    });

    this.autocompleteResults = this.autocompleteItems;

    this.tagInputSubscription = this.tagInputField.valueChanges.debounceTime(this.autocompleteDebounceTime)
    .do(value => {
      if (!(value.length >= this.minSearchTermLength)) {
        this.autocompleteResults = [];
        return;
      }

      if (this.autocompleteItemsCallback) {
        this.autocompleteItemsCallback(value).then((items: any) => {
          this.autocompleteItems = items;

          this.canShowAutoComplete = true;
          this._updateAutocompleteResultsList(value);
        }, () => {
          // Nothing do right now
        });
      } else {
        this.canShowAutoComplete = true;
        this._updateAutocompleteResultsList(value);
      }
    })
    .subscribe();
  }

  onKeydown(event: KeyboardEvent): void {
    let key = event.keyCode;
    switch (key) {
      case KEYS.backspace:
        this._handleBackspace();
        break;

      case KEYS.enter:
        if (this.addOnEnter && !this.showAutocomplete()) {
          this.submitInputValue();
          event.preventDefault();
        }
        break;

      case KEYS.comma:
        if (this.addOnComma) {
          this.submitInputValue();
          event.preventDefault();
        }
        break;

      case KEYS.space:
        if (this.addOnSpace) {
          this.submitInputValue();
          event.preventDefault();
        }
        break;

      case KEYS.downArrow:
        if (!this.showAutocomplete()) {
          this.canShowAutoComplete = true;
        }
        break;

      case KEYS.tab:
      case KEYS.backTab:
      case KEYS.esc:
        this.canShowAutoComplete = false;
        break;

      default:
        break;
    }
  }

  onInputBlurred(event): void {
    if (this.addOnBlur) {
      this.submitInputValue();
    }

    this.isFocused = false;
  }

  onInputFocused(): void {
    this.isFocused = true;
    this._updateAutocompleteResultsList(this.inputValue);
    setTimeout(() => this.canShowAutoComplete = true);
  }

  onInputClicked(): void {
    this.isFocused = true;
    this._updateAutocompleteResultsList(this.inputValue);
    setTimeout(() => this.canShowAutoComplete = true);
  }

  onInputPaste(event): void {
    let clipboardData = event.clipboardData || (event.originalEvent && event.originalEvent.clipboardData);

    if (!clipboardData) {
      return;
    }

    let pastedString = clipboardData.getData('text/plain');
    let tags = this._splitString(pastedString);
    this._addTags(tags);
    setTimeout(() => this._resetInput());
  }

  onAutocompleteSelect(selectedItem) {
    this._addTags([selectedItem]);
    this.tagInputElement.nativeElement.focus();
  }

  onAutocompleteEnter() {
    if (this.addOnEnter && this.showAutocomplete() && !this.autocompleteMustMatch) {
      this.submitInputValue();
    }
  }

  showAutocomplete(): boolean {
    return (
      this.autocomplete &&
      this.autocompleteResults &&
      this.autocompleteResults.length > 0 &&
      this.canShowAutoComplete &&
      this.inputValue.length >= this.minSearchTermLength
    );
  }

  submitInputValue(): void {
    this._addTags([this.inputValue]);
  }

  private _splitString(tagString: string): string[] {
    tagString = tagString.trim();
    let tags = tagString.split(this.splitRegExp);
    return tags.filter((tag) => !!tag);
  }

  private _isTagValid(tag: any): boolean {
    return this.allowedTagsPattern.test(this._prepareItem(tag)) && this._isTagUnique(tag);
  }

  private _isTagUnique(tag: any): boolean {
    if (this.allowDuplicates) {
      return true;
    }

    const valueToCheck = this._prepareItem(tag);

    return !this.tagsList.some(item => this._prepareItem(item) === valueToCheck);
  }

  private _isTagAutocompleteItem(tag: any): boolean {
    const valueToCheck = this._prepareItem(tag);

    return this.autocompleteItems.some(item => this._prepareItem(item) === valueToCheck);
  }

  private _emitTagAdded(addedTags: any[]): void {
    addedTags.forEach(tag => this.addTag.emit(tag));
  }

  private _emitTagRemoved(removedTag): void {
    this.removeTag.emit(removedTag);
  }

  private _addTags(tags: any[]): void {
    let validTags = tags.filter(tag => this._isTagValid(tag))
                        .filter((tag, index, tagArray) => tagArray.indexOf(tag) === index)
                        .filter(tag => (this.showAutocomplete() && this.autocompleteMustMatch) ? this._isTagAutocompleteItem(tag) : true);

    this.tagsList = this.tagsList.concat(validTags);
    this._resetSelected();
    this._resetInput();
    this.onChange(this.tagsList);
    this._emitTagAdded(validTags);
  }

  private _removeTag(tagIndexToRemove: number): void {
    let removedTag = this.tagsList[tagIndexToRemove];
    this.tagsList.splice(tagIndexToRemove, 1);
    this._resetSelected();
    this.onChange(this.tagsList);
    this._emitTagRemoved(removedTag);
  }

  private _handleBackspace(): void {
    if (!this.inputValue.length && this.tagsList.length) {
      if (!isBlank(this.selectedTag)) {
        this._removeTag(this.selectedTag);
        this._updateAutocompleteResultsList('');
      } else {
        this.selectedTag = this.tagsList.length - 1;
      }
    }
  }

  private _resetSelected(): void {
    this.selectedTag = null;
  }

  private _resetInput(): void {
    this.tagInputField.setValue('');
  }

  private _prepareItem(item: any): any {
    return typeof item === 'object' ? item[this.displayBy] : item;
  }

  private _updateAutocompleteResultsList(searchTerm: string): void {
    let filteredItems = this.autocompleteItems.filter(item => {
      /**
       * _isTagUnique makes sure to remove items from the autocompelte dropdown if they have
       * already been added to the model, and allowDuplicates is false
       */
      let itemToCheck = this._prepareItem(item);

      if (this.autocompleteItemsCallback) {
        return this._isTagUnique(item);
      } else {
        return (!searchTerm || itemToCheck.toLowerCase().indexOf(searchTerm.toLowerCase()) > -1) && this._isTagUnique(item);
      }
    });

    this.autocompleteResults = filteredItems.slice(0, this.autocompleteMaxItems);
  }

  /** Implemented as part of ControlValueAccessor. */
  onChange: (value: any) => any = () => { };

  onTouched: () => any = () => { };

  writeValue(value: any) {
    this.tagsList = value;
  }

  registerOnChange(fn: any) {
    this.onChange = fn;
  }

  registerOnTouched(fn: any) {
    this.onTouched = fn;
  }

  ngOnDestroy() {
    this.tagInputSubscription.unsubscribe();
  }
}
