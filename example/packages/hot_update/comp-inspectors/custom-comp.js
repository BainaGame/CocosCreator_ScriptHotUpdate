Vue.component('custom-comp-inspector', {
  template: `
    <cc-prop :target.sync="target.foo"></cc-prop>
    <cc-prop :target.sync="target.bar"></cc-prop>

    <img src="uuid://{{target.foo.value.uuid}}"></img>
  `,

  props: {
    target: {
      twoWay: true,
      type: Object,
    },
  },
});
