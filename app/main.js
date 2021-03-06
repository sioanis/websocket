$(function()
  {
    //  init slider
    $("#slider").noUiSlider
      (
        {
          range:[MIN_MINUTES,MAX_MINUTES],
          start:3,
          handles: 1,
          slide:function(){ onUpdateTimespan($(this).val().toFixed(0)); }
        }
      )
      .css("margin-left",margin.left+"px");

    initWebSocket();
    initChart();
  }
);

function initWebSocket()
{
  //  init blockchain websocket (activity, blocks)
  var blockchain = new WebSocket('ws://ws.blockchain.info/inv');

  blockchain.onerror = function (error){ console.log('connection.onerror',error); };

  blockchain.onopen = function ()
  {
    blockchain.send( JSON.stringify( {"op":"unconfirmed_sub"} ) );  //  subscribe to uncofirmed activity
    blockchain.send( JSON.stringify( {"op":"blocks_sub"} ) );    //  subscribe to new blocks
  };

  blockchain.onmessage = function (message)
  {
    var response = JSON.parse(message.data);

    var date = new Date(0);
    date.setUTCSeconds( response.x.time );

    if( response.op == "utx")
    {
      var amount = 0;

      for(var i=0;i<response.x.out.length;i++)
        amount += response.x.out[i].value;

      //  amount is in satoshi
      //  1 BTC = 100,000,000 Satoshi (https://en.bitcoin.it/wiki/activity)
      response.amount = amount / 100000000;
      response.type = TYPE_TRANSACTION;
      response.index = index++;
    }
    else if( response.op == "block" )
    {
      response.type = TYPE_BLOCK;
      response.amount = Math.round( response.x.height / 10000 );
    }

    if( DEBUG )
      console.log( response.op, response );

    response.date = date;

    activity.push( response )

    refresh();
  };

  //  init mtgox websocket (trades)
  var mtgox = new WebSocket('wss://websocket.mtgox.com/mtgox?currency=USD');

  mtgox.onerror = function (error) { console.log('connection.onerror',error); };

  mtgox.onmessage = function (message)
  {
    var response = JSON.parse(message.data);

    if( response.trade )  //  is it a trade
    {
      var date = new Date(0);
      date.setUTCSeconds( response.trade.date );

      response.type = TYPE_TRADE;
      response.amount = response.trade.amount_int / 100000000;
      response.date = date;

      activity.push( response );

      if( DEBUG ) console.log( response );

      refresh();
    }
  }
}

function initChart()
{
  svg  = d3.select("#chart").append("svg")
    .attr('class', 'chart')
    .attr("width",width)
    .attr("height",height)
      .append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var xaxis = svg.append("g")
    .attr("class","axis xaxis")
    .attr("transform", "translate(0," + (height - margin.top - margin.bottom) + ")")
    .call(xAxis);

  var yaxis = svg.append("g")
    .attr("class","axis yaxis").call(yAxis);

  /*
  xaxis.append("text")
      .attr("class","axisLabel")
      .attr("text-anchor","middle")
      .attr("transform", "translate(" + (width-margin.left-margin.right)/2 + "," + 40 + ")")
      .text("Transaction Time");

  yaxis.append("text")
    .attr("class","axisLabel")
    .attr("text-anchor","middle")
    .attr("transform", "rotate(-90 0 0),translate(-" + (height - margin.top - margin.bottom)/2 + ",-" + (margin.left*.75) + ")")
    .text("Transaction Amount (BTC)");
  */

  onUpdateTimespan();

  start();
}

function refresh()
{
  var dateMax = new Date();
  dateMax.setUTCMilliseconds( dateMax.getUTCMilliseconds() - (MAX_MINUTES * MINUTE) );

  //  remove undisplayable data points
  for(var i=activity.length-1;i>0;i--)
    if( activity[i].date.getTime() < dateMax.getTime() )
      activity.splice(i,1);

  var data = activity.slice(0);

  //  remove undisplayable data points
  for(var i=data.length-1;i>0;i--)
    if( data[i].date.getTime() < x.domain()[0].getTime() )
      data.splice(i,1);

  var maxDisplayable = new Date();
  maxDisplayable.setUTCMilliseconds( maxDisplayable.getUTCMilliseconds() - (MAX_MINUTES * MINUTE) );

  var dots = svg.selectAll(".node")
    .data( data, function(d) { return d.index; } );

  dots.enter()
    .append("g")
      .attr("id",function(d){ return "node" + d.index; } )
      .attr("class",nodeClass)
      .attr("transform", function(d) { return "translate(" + x(d.date) + "," + y(d.amount) + ")"; })
      .attr("title",tooltip)
         .on("mouseover",mouseover)
         .on("mouseout",mouseout)
           .append("circle")
          .attr("r",6)
          .attr("fill","#000");

  dots.exit().remove();

  svg.select(".yaxis").transition().duration(250).call(yAxis);

  $('g.node').tooltip( {container: "body", html:true, trigger: "manual"} );
}

function onUpdateTimespan(value)
{
  value = value || minutesDisplayed;

  minutesDisplayed = value;

  $("#slider-value").text("about " + minutesDisplayed + " minutes");

  updateXAxis();

  refresh();
}

function updateXAxis()
{
  var today = new Date();

  x.domain( [ new Date(today.getTime() - MINUTE * minutesDisplayed), today ] );

  svg.select(".xaxis").transition().duration().call(xAxis);

  svg.selectAll("g.node").transition().duration(0).attr("transform", function(d) { return "translate(" + x(d.date) + "," + y(d.amount) + ")"; });
}

function tooltip(d)
{
  if( d.type == TYPE_TRANSACTION )
  {
    var inputs = [];
    for(var i=0;i<d.x.out.length;i++)
      inputs.push( d.x.out[i].value/100000000 );

    return "Transfer of " + d.amount + " BTC " + (inputs.length ? "(" + inputs.join(" BTC + ") + " BTC)" : "");
  }
  else if( d.type == "trade" )
  {
    return "Trade: " + d.amount + " BTC @ " + d.trade.price + " " + d.trade.price_currency;
  }
  else if( d.type == "block" )
  {
    return "New block found (" + d.amount + " generated)";
  }
}

function nodeClass(d)
{
  return "node " + d.type;
}

function mouseover(d)
{
  d3.select("#node" + d.index + " text").attr("display","block");
  $("#node" + d.index).tooltip("show");

  stop();
}

function mouseout(d)
{
  d3.select("#node" + d.index+ " text").attr("display","none");
  $("#node" + d.index).tooltip("hide");

  start();
}

function start()
{
  updateInterval = setInterval( updateXAxis, 100 );
}

function stop()
{
  clearInterval( updateInterval );
}

//  constants
var TYPE_TRANSACTION = "transaction";
var TYPE_TRADE = "trade";
var TYPE_BLOCK = "block";
var MINUTE = 1000*60;
var HOUR = MINUTE*60;
var MIN_MINUTES = 1;
var MAX_MINUTES = 10;
var DEBUG = false;

var minutesDisplayed = 3;
var numberFormat = d3.format(",f");
var currencyFormatter = d3.format(",.2f");
var timeFormat = d3.time.format.utc("%H:%M:%S UTC");

var svg,updateInterval;
var margin = {top: 20, right: 20, bottom: 50, left: 100};
var width = 700,height=400,chartHeight=height-margin.top-margin.bottom,chartWidth=width-margin.left-margin.right;

var yMax = 200;
var h = height-margin.bottom-margin.top;
var x = d3.time.scale().range([0, width - margin.left - margin.right]);
var y = d3.scale.pow().exponent(.5).domain([0,100,1000]).range([h,h/2,0]);

var xAxis = d3.svg.axis().scale(x).orient("bottom").ticks(6).tickPadding(10).tickSize(-chartHeight,0,-chartHeight).tickFormat(timeFormat);
var yAxis = d3.svg.axis().scale(y).orient("left").tickFormat(function(d) { return currencyFormatter(d) + " BTC"; }).tickPadding(10).tickSize(-chartWidth,0,-chartWidth);/*.tickFormat(logFormat);*/

var activity = [];
var index = 0;
