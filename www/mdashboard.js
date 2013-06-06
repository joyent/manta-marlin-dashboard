/*
 * mdashboard.js: Marlin dashboard implementation
 */

window.onload = mInit;

var mTableCommonConfig = {
    'bFilter': false,
    'bInfo': false,
    'bPaginate': false,
    'bLengthChange': false
};

var mTableConfig = {
    'supervisors': {
	'domid': 'mSupervisorTable',
	'config': {
	    'aoColumns': [
		{ 'sTitle': 'Supervisor',
		    'sClass': 'mUuid', 'sType': 'numeric' },
		{ 'sTitle': 'AuthP' },
		{ 'sTitle': 'LocsP' },
		{ 'sTitle': 'DelsP' },
		{ 'sTitle': 'LRq' },
		{ 'sTitle': 'LRs' },
		{ 'sTitle': 'ARq' },
		{ 'sTitle': 'ARs' }
	    ]
	}
    },
    'jobs': {
	'domid': 'mJobTable',
	'config': {
	    'aoColumns': [
		{ 'sTitle': 'Jobid', 'sClass': 'mUuid' },
		{ 'sTitle': 'User' },
		{ 'sTitle': 'Asgn' },
		{ 'sTitle': 'InProc' },
		{ 'sTitle': 'TasksDisp' },
		{ 'sTitle': 'TasksComm' },
		{ 'sTitle': 'Out' },
		{ 'sTitle': 'Retries' },
		{ 'sTitle': 'Err' }
	    ]
	}
    },
    'groups': {
	'domid': 'mRunningGroupsTable',
	'config': {
	    'aoColumns': [
		{ 'sTitle': 'Server' },
		{ 'sTitle': 'Jobid', 'sClass': 'mUuid' },
		{ 'sTitle': 'Ph' },
		{ 'sTitle': 'Kind' },
		{ 'sTitle': 'Queued' },
		{ 'sTitle': 'Running' },
		{ 'sTitle': 'Share' },
		{ 'sTitle': 'Zones' }
	    ]
	}
    }
};

/* DOM elements */
var spanUpdateTime;				/* last updated time */

/* Application configuration */
var mServerUrl = window.location.origin;	/* kang proxy server location */
var mRefreshInterval = 1000;			/* ms between refreshes */

/* Application state */
var mTables = {};
var mZoneStates;
var mUpdateTime;
var mSnapshot;

function mInit()
{
	var k;

	for (k in mTableConfig)
		mTables[k] = new mTable(k, mTableConfig[k]);
	mZoneStates = new mZoneStateWidget('zonegrid', 'mZoneStates');
	spanUpdateTime = document.getElementById('mUpdateTime');

	mRedrawWorld();
	mRefresh();
}

function mRedrawWorld()
{
	var k;

	for (k in mTables)
		mTables[k].redraw();

	mZoneStates.redraw();
	spanUpdateTime.firstChild.nodeValue = mFormatDate(mUpdateTime);
}

function mRefresh()
{
	$.getJSON(mServerUrl + '/marlin', function (data) {
		mLoadData(data);
		mRedrawWorld();
		setTimeout(mRefresh, mRefreshInterval);
	});
}

function mLoadData(data)
{
	mUpdateTime = new Date();
	mSnapshot = data;

	var svcs, rows, k, o, r, i, e;
	var rowbyagent = {};
	var zonedata = {};

	svcs = data.cs_objects['service'];

	if (data.cs_objects['agent']) {
		for (k in data.cs_objects['agent']) {
			o = data.cs_objects['agent'][k][0];
			r = [
			    svcs[o['origin']][0]['ident'],
			    o['nTasks'],
			    o['slopDiskUsed'] + ' / ' +
			        o['slopDiskTotal'] + 'GB',
			    o['slopMemUsed'] + ' / ' +
			        o['slopMemTotal'] + 'MB',
			    0,	/* total nzones */
			    0,	/* nbusy */
			    0,	/* ninit */
			    0 	/* ndisabled */
			];
			rowbyagent[o['origin']] = r;
		}
	}

	if (data.cs_objects['zone']) {
		for (k in data.cs_objects['zone']) {
			o = data.cs_objects['zone'][k][0];
			r = rowbyagent[o['origin']];
			if (!r)
				continue;

			r[4]++;
			if (o['state'] == 'busy')
				r[5]++;
			else if (o['state'] == 'uninit')
				r[6]++;
			else if (o['state'] == 'disabled')
				r[7]++;
		}

		for (k in rowbyagent) {
			zonedata[k] = {
			    'i': 0,
			    'values': rowbyagent[k],
			    'data': new Array(rowbyagent[k][6]),
			    'label': svcs[k][0]['ident']
			};
		}

		for (k in data.cs_objects['zone']) {
			o = data.cs_objects['zone'][k][0];
			r = rowbyagent[o['origin']];
			if (!r)
				continue;

			e = zonedata[o['origin']];
			e['data'][e['i']++] = [ k, o['state'][0] ];
		}

		mZoneStates.zs_data = zonedata;
	}

	rows = [];
	if (data.cs_objects['worker']) {
		for (k in data.cs_objects['worker']) {
			o = data.cs_objects['worker'][k][0];
			r = [
			    o['conf']['instanceUuid'],
			    o['nLocs'],
			    o['nLocIn'],
			    o['nLocOut'],
			    o['nAuths'],
			    o['nAuthsIn'],
			    o['nAuthsOut'],
			    o['nDels']
			];
			rows.push(r);
		}
	}
	mTables['supervisors'].t_rows = rows;

	rows = [];
	if (data.cs_objects['job']) {
		for (k in data.cs_objects['job']) {
			/* Find the worker "job" record, not the agent ones. */
			for (i = 0; i < data.cs_objects['job'][k].length; i++) {
				o = data.cs_objects['job'][k][i];
				if (svcs[o['origin']][0]['component'] ==
				    'jobworker')
					break;
			}

			if (svcs[o['origin']][0]['component'] != 'jobworker')
				continue;

			r = [
			    o['record']['jobId'],
			    o['record']['auth']['login'],
			    o['record']['stats']['nAssigns'],
			    o['record']['stats']['nInputsRead'],
			    o['record']['stats']['nTasksDispatched'],
			    o['record']['stats']['nTasksCommittedOk'] +
			        o['record']['stats']['nTasksCommittedFail'],
			    o['record']['stats']['nJobOutputs'],
			    o['record']['stats']['nRetries'],
			    o['record']['stats']['nErrors']
			];

			rows.push(r);
		}
	}
	mTables['jobs'].t_rows = rows;

	rows = [];
	if (data.cs_objects['taskgroup']) {
		for (k in data.cs_objects['taskgroup']) {
			data.cs_objects['taskgroup'][k].forEach(function (g) {
				o = g;
				if (!svcs[o['origin']])
					return;
				r = [
				    svcs[o['origin']][0]['ident'],
				    o['jobid'],
				    o['phasei'],
				    o['phase'] ?
					(o['phase']['type'] +
				        (o['phase']['type'] == 'reduce' ?
				        ' (' + (o['phase']['count'] || 1) +
					')' : '')) : 'unknown',
				    o['ntasks'],
				    o['nrunning'],
				    o['nstreams'],
				    o['share']
				];
				rows.push(r);
			});
		}
	}
	mTables['groups'].t_rows = rows;
}

function mTable(key, conf)
{
	this.t_key = key;
	this.t_elt = document.getElementById(conf['domid']);
	this.t_rows = [];
	this.t_config = {};
	this.t_drawn = false;

	var k;
	for (k in mTableCommonConfig)
		this.t_config[k] = mTableCommonConfig[k];
	for (k in conf['config'])
		this.t_config[k] = conf['config'][k];
}

mTable.prototype.redraw = function ()
{
	if (this.t_drawn)
		$(this.t_elt).dataTable().fnDestroy();

	var conf = {};
	for (var k in this.t_config)
		conf[k] = this.t_config[k];
	conf['aaData'] = this.t_rows;
	$(this.t_elt).dataTable(conf);
	this.t_drawn = true;
};

function mFormatDate(time)
{
	if (!time)
		return ('never');

	var h, m, s;
	h = time.getHours();
	m = time.getMinutes();
	if (m < 10)
		m = '0' + m;
	s = time.getSeconds();
	if (s < 10)
		s = '0' + s;

	return (h + ':' + m + ':' + s);
}

function mZoneStateWidget(key, domid)
{
	this.zs_data = {};
	this.zs_table = new mTable(key, {
	    'domid': domid,
	    'config': {
	        'aoColumns': [
		    { 'sTitle': 'Agent' },
		    { 'sTitle': 'Tasks' },
		    { 'sTitle': 'Disk slop used' },
		    { 'sTitle': 'Mem slop used' },
		    { 'sTitle': 'Z' },
		    { 'sTitle': 'B' },
		    { 'sTitle': 'R' },
		    { 'sTitle': 'D' },
		    { 'sTitle': 'Zones' }
		]
	    }
	});
}

mZoneStateWidget.prototype.redraw = function ()
{
	var data = this.zs_data;
	var rows, div, wrap, k, row;

	rows = [];

	for (k in data) {
		wrap = document.createElement('div');
		div = wrap.appendChild(document.createElement('div'));
		div.className = 'mZoneRow';

		data[k]['data'].forEach(function (s, i) {
			var elt = div.appendChild(
			    document.createElement('div'));
			elt.className = 'mZoneState' + s[1].toUpperCase();
			elt.title = s[0];

			if (i % 32 == 31) {
				div = wrap.appendChild(
				    document.createElement('div'));
				div.className = 'mZoneRow';
			}
		});

		row = data[k]['values'].slice(0);
		row.push(wrap.innerHTML);
		rows.push(row);
	}

	this.zs_table.t_rows = rows;
	this.zs_table.redraw();
};
