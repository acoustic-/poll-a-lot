import { PointVoteStepperComponent } from './point-vote-stepper.component';

function fakeEvent(): Event {
  return { stopPropagation: jasmine.createSpy('stopPropagation') } as unknown as Event;
}

describe('PointVoteStepperComponent', () => {
  let component: PointVoteStepperComponent;

  beforeEach(() => {
    component = new PointVoteStepperComponent();
  });

  describe('addClicked', () => {
    it('always stops the click from bubbling to the parent voter chip', () => {
      const event = fakeEvent();
      component.canAdd = false;
      component.addClicked(event);
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('does not emit `add` when canAdd is false (budget/cap exhausted)', () => {
      const spy = jasmine.createSpy('add');
      component.add.subscribe(spy);
      component.canAdd = false;
      component.addClicked(fakeEvent());
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits `add` when canAdd is true', () => {
      const spy = jasmine.createSpy('add');
      component.add.subscribe(spy);
      component.canAdd = true;
      component.addClicked(fakeEvent());
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('removeClicked', () => {
    it('always stops the click from bubbling to the parent voter chip', () => {
      const event = fakeEvent();
      component.canRemove = false;
      component.removeClicked(event);
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('does not emit `remove` when canRemove is false (no points allocated yet)', () => {
      const spy = jasmine.createSpy('remove');
      component.remove.subscribe(spy);
      component.canRemove = false;
      component.removeClicked(fakeEvent());
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits `remove` when canRemove is true', () => {
      const spy = jasmine.createSpy('remove');
      component.remove.subscribe(spy);
      component.canRemove = true;
      component.removeClicked(fakeEvent());
      expect(spy).toHaveBeenCalled();
    });
  });
});
