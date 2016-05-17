import can from 'can/util/library';
import CanMap from 'can/map/';
import 'can/map/define/';
import List from 'can/list/';
import Component from 'can/component/';
import Route from 'can/route/';
//import './widget.css!';
import template from './template.stache!';

import '../list-table/';
import '../property-table/';
import '../form-widget/';
import '../filter-widget/';
import '../paginate-widget/';
import '../modal-container/';
import '../tab-container/';
import '../panel-container/';

import { ADD_MESSSAGE_TOPIC, CLEAR_MESSAGES_TOPIC } from '../../util/topics';
import { Message } from '../../util/message';
import PubSub from 'pubsub-js';
const DEFAULT_BUTTONS = [{
  iconClass: 'fa fa-list-ul',
  eventName: 'view',
  title: 'View Row Details'
}];
const EDIT_BUTTONS = DEFAULT_BUTTONS.concat([{
  iconClass: 'fa fa-pencil',
  eventName: 'edit',
  title: 'Edit Row'
}, {
  iconClass: 'fa fa-trash',
  eventName: 'delete',
  title: 'Remove Row'
}]);

export let viewModel = CanMap.extend({
  define: {
    view: {},
    parameters: {
      Value: CanMap,
      Type: CanMap
    },
    page: {
      value: 'all',
      type: 'string'
    },
    totalPages: {
      get: function(val, setAttr) {
        //round up to the nearest integer
        return Math.ceil(this.attr('view.connectionProperties.totalItems') /
          this.attr('queryPerPage'));
      }
    },
    objects: {
      get: function(prev, setAttr) {
        var promise = this.attr('view.connection').getList(this.attr('parameters').attr());
        promise.catch(function(err) {
          console.error('unable to complete objects request', err);
        });
        return promise;
      }
    },
    focusObject: {
      get: function(prev, setAttr) {
        if (this.attr('viewId')) {
          var params = {};
          params[this.attr('view.connection').idProp] = this.attr('viewId');
          var promise = this.attr('view.connection').get(params);
          promise.catch(function(err) {
            console.error('unable to complete focusObject request', err);
          });
          return promise;
        }
        return null;
      }
    },
    buttons: {
      type: '*',
      get: function() {
        return this.attr('view.disableEdit') ? DEFAULT_BUTTONS : EDIT_BUTTONS;
      }
    },
    queryFilters: {
      Value: List
    },
    queryPage: {
      type: 'number',
      value: 0,
      set: function(page) {
        var params = this.attr('parameters');
        if (!params) {
          return page;
        }
        params.attr('page[number]', page + 1);
        return page;
      }
    },
    queryPageNumber: {
      get: function() {
        return this.attr('queryPage') + 1;
      }
    },
    queryPerPage: {
      type: 'number',
      value: 10,
      set: function(perPage) {
        var params = this.attr('parameters');
        if (!params) {
          return perPage;
        }
        params.attr('page[size]', perPage);
        return perPage;
      }
    },
    sort: {
      Value: CanMap
    },
    viewId: {
      type: 'number',
      value: 0
    },
    progress: {
      type: 'number',
      value: 100
    },
    filterVisible: {
      type: 'boolean',
      value: false
    }
  },
  init: function() {
    var params = this.attr('parameters');
    can.batch.start();
    params.attr({
      'page[size]': this.attr('queryPerPage'),
      'page[number]': this.attr('queryPage')
    });
    if (this.attr('relatedField') && this.attr('relatedValue')) {
      this.attr('queryFilters').push({
        name: this.attr('relatedField'),
        op: '==',
        val: this.attr('relatedValue')
      });
    }
    this.setFilterParameter(this.attr('queryFilters'));
    can.batch.stop();
  },
  editObject: function(scope, dom, event, obj) {
    this.attr('viewId', this.attr('view.connection').id(obj));
    this.attr('page', 'edit');
  },
  viewObject: function(scope, dom, event, obj) {
    this.attr('viewId', this.attr('view.connection').id(obj));
    this.attr('page', 'details');
  },
  saveObject: function(scope, dom, event, obj) {
    this.attr('progress', 100);
    this.attr('page', 'loading');
    var deferred = this.attr('view.connection').save(obj);
    deferred.then(result => {
      //add a message
      PubSub.publish(ADD_MESSSAGE_TOPIC, new Message({
        message: this.attr('view.saveSuccessMessage'),
        detail: 'ID: ' + this.attr('view.connection').id(result)
      }));

      //update the view id
      this.attr('viewId', result.attr('id'));

      //set page to the details view by default
      this.attr('page', 'details');

    }).fail(e => {
      console.warn(e);
      PubSub.publish(ADD_MESSSAGE_TOPIC, new Message({
        message:  this.attr('view.saveFailMessage'),
        detail: e.statusText,
        level: 'danger'
      }));
      this.attr('page', 'all');
    });
    return deferred;
  },
  resetPage: function() {
    this.attr('page', 'all');
    this.attr('viewId', 0);
  },
  createObject: function() {
    this.attr('page', 'add');
  },
  getNewObject() {
    //create a new empty object with the defaults provided
    //from the objectTemplate property which is a map
    return this.attr('view.objectTemplate')();
  },
  deleteObject: function(scope, dom, event, obj, skipConfirm) {
    if (obj && (skipConfirm || confirm('Are you sure you want to delete this record?'))) {
      let deferred = this.attr('view.connection').destroy(obj);
      deferred.then(result => {
        //add a message
        PubSub.publish(ADD_MESSSAGE_TOPIC, new Message({
          message: this.attr('view.deleteSuccessMessage'),
          detail: 'ID: ' + this.attr('view.connection').id(result)
        }));
      });

      deferred.fail(result => {
        //add a message
        PubSub.publish(ADD_MESSSAGE_TOPIC, new Message({
          message: this.attr('view.deleteFailMessage'),
          detail: result.statusText,
          level: 'danger'
        }));
      });
      return deferred;
    }
  },
  deleteMultiple: function() {
    if (confirm('Are you sure you want to delete the selected records?')) {
      this.attr('selectedObjects').forEach((obj) => {
        this.deleteObject(null, null, null, obj, true);
      });
      this.attr('selectedObjects').replace([]);
    }
  },
  setFilterParameter: function(filters) {
    var params = this.attr('parameters');
    //reset the page filter
    this.attr('queryPage', 0);
    if (filters && filters.length) {
      //if there are filters in the list, set the filter parameter
      params.attr('filter[objects]', JSON.stringify(filters.attr()));
    } else {
      //remove the filter parameter
      params.removeAttr('filter[objects]');
    }
  },
  setSortParameter: function(sort) {
    var params = this.attr('parameters');
    if (!sort.attr('fieldName')) {
      params.removeAttr('sort');
      return sort;
    }
    this.attr('parameters.sort', sort.type === 'asc' ? sort.fieldName : '-' + sort.fieldName);
  },
  toggleFilter: function(val) {
    if (typeof val !== 'undefined') {
      this.attr('filterVisible', val);
    } else {
      this.attr('filterVisible', !this.attr('filterVisible'));
    }
  },
  isListTable() {
    return this.attr('view.listType') !== 'property-table';
  },
  getRelatedValue(foreignKey, focusObject) {
    return focusObject.attr(foreignKey);
  }
});

Component.extend({
  tag: 'crud-manager',
  viewModel: viewModel,
  template: template,
  leakScope: false,
  events: {
    //bind to the change event of the entire list
    '{viewModel.queryFilters} change': function(filters) {
      this.viewModel.setFilterParameter(filters);
    },
    //bind to the change event of the entire map
    '{viewModel.sort} change': function(sort) {
      this.viewModel.setSortParameter(sort);
    }
  }
});
