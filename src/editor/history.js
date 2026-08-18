export class History {
  constructor(limit=60){this.limit=limit;this.undoStack=[];this.redoStack=[];}
  clear(){this.undoStack.length=0;this.redoStack.length=0;}
  push(value){this.undoStack.push(structuredClone(value));if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack.length=0;}
  undo(current){if(!this.undoStack.length)return null;this.redoStack.push(structuredClone(current));return this.undoStack.pop();}
  redo(current){if(!this.redoStack.length)return null;this.undoStack.push(structuredClone(current));return this.redoStack.pop();}
  get canUndo(){return this.undoStack.length>0;}get canRedo(){return this.redoStack.length>0;}
}
