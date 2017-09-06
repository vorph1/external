/**
 * @copyright Copyright (c) 2017 Joas Schilling <coding@schilljs.com>
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/* global OC, OCA, _, Backbone */
(function(OC, OCA, _, Backbone) {
	if (!OCA.External) {
		/**
		 * @namespace
		 */
		OCA.External = {};
	}

	Handlebars.registerHelper('isSelected', function(currentValue, itemValue) {
		return currentValue === itemValue;
	});

	Handlebars.registerHelper('getLanguages', function() {
		return OCA.External.App.availableLanguages;
	});

	Handlebars.registerHelper('getTypes', function() {
		return OCA.External.App.availableTypes;
	});

	Handlebars.registerHelper('getDevices', function() {
		return OCA.External.App.availableDevices;
	});

	Handlebars.registerHelper('getIcons', function() {
		return OCA.External.App.availableIcons;
	});

	OCA.External.Models = OCA.External.Models || {};

	OCA.External.Models.Site = Backbone.Model.extend({
		defaults: {
			name: '',
			url: '',
			lang: '',
			type: 'link',
			device: '',
			icon: 'external.svg'
		},

		parse: function(response) {
			if (!_.isUndefined(response.ocs)) {
				// Parse of single response from save/create
				return response.ocs.data;
			}

			// Parse of entry from collection data
			return response;
		}
	});

	OCA.External.Models.SiteCollection = Backbone.Collection.extend({
		model: OCA.External.Models.Site,
		url: OC.linkToOCS('apps/external/api/v1', 2) + 'sites',

		parse: function(response) {
			return response.ocs.data.sites;
		}
	});

	OCA.External.App = {
		/** @property {OCA.External.Models.SiteCollection} _sites  */
		_sites: null,

		$list: null,

		_compiledSiteTemplate: null,
		_compiledIconTemplate: null,

		init: function() {
			var self = this;
			this.$list = $('ul.external_sites');

			$('#add_external_site').click(function(e) {
				e.preventDefault();

				var $el = $(self._compiledSiteTemplate({
					id: 'new-' + Date.now(),
					name: t('external', 'New site'),
					icon: 'external.svg',
					type: 'link',
					lang: '',
					device: ''
				}));
				self._attachEvents($el);
				$el.find('.options').removeClass('hidden');
				self.$list.append($el);
			});
			this._compiledSiteTemplate = Handlebars.compile($('#site-template').html());
			this._compiledIconTemplate = Handlebars.compile($('#icon-template').html());

			this.load();
		},

		load: function() {
			var self = this;
			$('#loading_sites').removeClass('hidden');
			this.$list.empty();

			this._sites = new OCA.External.Models.SiteCollection();
			this._sites.fetch({
				success: function(_, response) {
					$('#loading_sites').addClass('hidden');

					_.each(response.ocs.data.icons, function(icon) {
						console.log('icon');
					});

					self.availableIcons = response.ocs.data.icons;
					self._buildIconList(response.ocs.data.icons);
					self.availableLanguages = response.ocs.data.languages;
					self.availableTypes = response.ocs.data.types;
					self.availableDevices = response.ocs.data.devices;

					if (response.ocs.data.sites.length === 0) {
						var $el = $(self._compiledSiteTemplate({
							id: 'undefined'
						}));
						self._attachEvents($el);
						self.$list.append($el);
					} else {
						self._render();
					}
				}
			});
		},

		_render: function() {
			var self = this;

			_.each(this._sites.models, function(site) {
				var $el = $(self._compiledSiteTemplate(site.attributes));
				self._attachEvents($el);
				self.$list.append($el);
			});
		},

		_attachEvents: function($site) {
			$site.find('.delete-button').click(_.bind(this._deleteSite, this));
			$site.find('.trigger-save').change(_.bind(this._saveSite, this));
			$site.find('.icon-more').on('click', function() {
				$site.find('.options').toggleClass('hidden');
			});
		},

		_deleteSite: function(e) {
			e.preventDefault();

			var $site = $(e.target).closest('li'),
				site = this._sites.get($site.data('site-id'));

			$site.removeClass('failure saved').addClass('saving');

			if (!_.isUndefined(site)) {
				site.destroy({
					success: function() {
						$site.remove();
						if(OC.Settings && OC.Settings.Apps) {
							OC.Settings.Apps.rebuildNavigation();
						}
					}
				});
			} else {
				$site.remove();
			}
		},

		_saveSite: function(e) {
			e.preventDefault();

			var self = this,
				$target = $(e.target),
				$site = $target.closest('li'),
				site = this._sites.get($site.data('site-id')),
				data = {
					name: $site.find('.site-name').val(),
					url: $site.find('.site-url').val(),
					lang: $site.find('.site-lang').val(),
					type: $site.find('.site-type').val(),
					device: $site.find('.site-device').val(),
					redirect: $site.find('.site-redirect').prop("checked") ? 1 : 0,
					icon: $site.find('.site-icon').val()
				};

			$site.removeClass('failure saved').addClass('saving');
			$site.find('.invalid-value').removeClass('invalid-value');

			if (!_.isUndefined(site)) {
				site.save(data, {
					success: function() {
						$site.removeClass('saving').addClass('saved');
						$site.find('h3').html(escapeHTML(data.name) + ' <small>' + escapeHTML(data.url) + '</small>');
						$('#appmenu li[data-id="external_index' + site.get('id') + '"] span').text(data.name);
						setTimeout(function() {
							$site.removeClass('saved');
						}, 2500);
						self._rebuildNavigation();
					},
					error: function(model, xhr) {
						if (!_.isUndefined(xhr.responseJSON.ocs.data.field) && xhr.responseJSON.ocs.data.field !== '') {
							$site.find('.site-' + xhr.responseJSON.ocs.data.field).addClass('invalid-value');
						}
						$site.removeClass('saving').addClass('failure');
					}
				});
			} else {
				this._sites.create(data, {
					success: function(site) {
						$site.data('site-id', site.get('id'));
						$site.removeClass('saving').addClass('saved');
						$site.find('h3').html(escapeHTML(data.name) + ' <small>' + escapeHTML(data.url) + '</small>');
						setTimeout(function() {
							$site.removeClass('saved');
						}, 2500);
						self._rebuildNavigation();
					},
					error: function(model, xhr) {
						if (!_.isUndefined(xhr.responseJSON.ocs.data.field) && xhr.responseJSON.ocs.data.field !== '') {
							$site.find('.site-' + xhr.responseJSON.ocs.data.field).addClass('invalid-value');
						}
						$site.removeClass('saving').addClass('failure');
					}
				});
			}
		},

		_buildIconList: function(data) {
			var self = this,
				$table = $('ul.icon-list'),
				lastIcon = '',
				$lastIcon = null,
				icons = [];
			$table.empty();

			_.each(data, function(data) {
				if (data.icon === '') {
					icons.push(data);
					return;
				}

				if (lastIcon !== '' && data.name === lastIcon.replace('-dark.', '.')) {
					$lastIcon.find('div.img').prepend($('<img>').attr('src', data.url));
					$lastIcon.find('span.name').prepend(data.name + ' / ');
					$lastIcon.addClass('twin-icons');

					icons.pop();
					icons.push(_.extend(data, {
						name: data.name + ' / ' + lastIcon
					}));
					return;
				}


				var $row = $(self._compiledIconTemplate(data));
				self._attachEventsIcon($row);
				$table.append($row);
				icons.push(data);

				lastIcon = data.name;
				$lastIcon = $row;
			});

			this.availableIcons = icons;
		},

		_attachEventsIcon: function($icon) {
			$icon.find('span.icon-delete').click(_.bind(this._deleteIcon, this));
		},

		_deleteIcon: function(e) {
			var $row = $(e.currentTarget).parents('li'),
				icon = $row.attr('data-icon');

			$.ajax({
				type: 'DELETE',
				url: OC.generateUrl('/apps/external/icons/' + icon)
			}).done(function () {
				$row.slideUp();
				setTimeout(function() {
					$row.remove();
				}, 750);

			});
			console.log($row);
			console.log(icon);
		},

		_rebuildNavigation: function() {
			$.getJSON(OC.filePath('settings', 'ajax', 'navigationdetect.php')).done(function(response){
				if(response.status === 'success') {
					var addedApps = {};
					var navEntries = response.nav_entries;
					var container = $('#apps ul');

					// remove disabled apps
					for (var i = 0; i < navEntries.length; i++) {
						var entry = navEntries[i];
						if(container.children('li[data-id="' + entry.id + '"]').length === 0) {
							addedApps[entry.id] = true;
						}
					}
					container.children('li[data-id]').each(function (index, el) {
						var id = $(el).data('id');
						// remove all apps that are not in the correct order
						if (!navEntries[index] || (navEntries[index] && navEntries[index].id !== $(el).data('id'))) {
							$(el).remove();
							$('#appmenu li[data-id='+id+']').remove();
						}
					});

					var previousEntry = {};
					// add enabled apps to #navigation and #appmenu
					for (var i = 0; i < navEntries.length; i++) {
						var entry = navEntries[i];
						if (container.children('li[data-id="' + entry.id + '"]').length === 0) {
							var li = $('<li></li>');
							li.attr('data-id', entry.id);
							var img = '<svg width="16" height="16" viewBox="0 0 16 16">';
							img += '<defs><filter id="invert"><feColorMatrix in="SourceGraphic" type="matrix" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0" /></filter></defs>';
							img += '<image x="0" y="0" width="16" height="16" preserveAspectRatio="xMinYMin meet" filter="url(#invert)" xlink:href="' + entry.icon + '"  class="app-icon" /></svg>';
							var a = $('<a></a>').attr('href', entry.href);
							var filename = $('<span></span>');
							var loading = $('<div class="icon-loading-dark"></div>').css('display', 'none');
							filename.text(entry.name);
							a.prepend(filename);
							a.prepend(loading);
							a.prepend(img);
							li.append(a);

							$('#navigation li[data-id=' + previousEntry.id + ']').after(li);

							// draw attention to the newly added app entry
							// by flashing it twice
							if(addedApps[entry.id]) {
								$('#header .menutoggle')
									.animate({opacity: 0.5})
									.animate({opacity: 1})
									.animate({opacity: 0.5})
									.animate({opacity: 1})
									.animate({opacity: 0.75});
							}
						}

						if ($('#appmenu').children('li[data-id="' + entry.id + '"]').length === 0) {
							var li = $('<li></li>');
							li.attr('data-id', entry.id);
							var img = '<img src="' + entry.icon + '" class="app-icon">';
							var a = $('<a></a>').attr('href', entry.href);
							var filename = $('<span></span>');
							var loading = $('<div class="icon-loading-dark"></div>').css('display', 'none');
							filename.text(entry.name);
							a.prepend(filename);
							a.prepend(loading);
							a.prepend(img);
							li.append(a);
							$('#appmenu li[data-id='+ previousEntry.id+']').after(li);
							if(addedApps[entry.id]) {
								li.animate({opacity: 0.5})
									.animate({opacity: 1})
									.animate({opacity: 0.5})
									.animate({opacity: 1});
							}
						}
						previousEntry = entry;
					}

					$(window).trigger('resize');
				}
			});
		}
	}
})(OC, OCA, _, OC.Backbone);

$(document).ready(function(){
	OCA.External.App.init();

	var uploadParamsLogo = {
		pasteZone: null,
		dropZone: null,
		submit: function() {
			OC.msg.startAction('form.uploadButton span.msg', t('external', 'Uploading…'));
			$('label#uploadlogo').removeClass('icon-upload').addClass('icon-loading-small');
		},
		done: function () {
			OCA.External.App.load();
			OC.msg.finishedSuccess('form.uploadButton span.msg', t('external', 'Reloading icon list…'));
			$('label#uploadlogo').addClass('icon-upload').removeClass('icon-loading-small');
		},
		fail: function (e, result) {
			OC.msg.finishedError('form.uploadButton span.msg', result.jqXHR.responseJSON.error);
			$('label#uploadlogo').addClass('icon-upload').removeClass('icon-loading-small');
		}
	};

	$('#uploadlogo').fileupload(uploadParamsLogo);
});
