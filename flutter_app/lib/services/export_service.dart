import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';

class ExportService {
  static Future<void> exportTripHistory(List<Map<String, dynamic>> trips, {bool share = false}) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        header: (context) => _buildHeader(),
        footer: (context) => _buildFooter(context),
        build: (context) => [
          _buildSummary(trips),
          pw.SizedBox(height: 20),
          _buildTripsTable(trips),
        ],
      ),
    );

    if (share) {
      final bytes = await pdf.save();
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/MyRide_Trip_History.pdf');
      await file.writeAsBytes(bytes);
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], text: 'My Trip History from MyRide'));
    } else {
      await Printing.layoutPdf(onLayout: (format) => pdf.save());
    }
  }

  static pw.Widget _buildHeader() {
    return pw.Container(
      padding: const pw.EdgeInsets.only(bottom: 20),
      decoration: const pw.BoxDecoration(
        border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey300, width: 1)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text('MyRide', style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold, color: PdfColors.amber700)),
              pw.SizedBox(height: 4),
              pw.Text('Trip History Report', style: const pw.TextStyle(fontSize: 14, color: PdfColors.grey600)),
            ],
          ),
          pw.Text(
            'Generated: ${DateTime.now().toString().split('.')[0]}',
            style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey500),
          ),
        ],
      ),
    );
  }

  static pw.Widget _buildFooter(pw.Context context) {
    return pw.Container(
      alignment: pw.Alignment.centerRight,
      margin: const pw.EdgeInsets.only(top: 10),
      child: pw.Text(
        'Page ${context.pageNumber} of ${context.pagesCount}',
        style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey500),
      ),
    );
  }

  static pw.Widget _buildSummary(List<Map<String, dynamic>> trips) {
    final totalTrips = trips.length;
    final completedTrips = trips.where((t) => t['status'] == 'completed').length;

    return pw.Container(
      padding: const pw.EdgeInsets.all(16),
      decoration: pw.BoxDecoration(
        color: PdfColors.amber50,
        borderRadius: pw.BorderRadius.circular(8),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceAround,
        children: [
          _buildSummaryItem('Total Trips', totalTrips.toString()),
          _buildSummaryItem('Completed', completedTrips.toString()),
          _buildSummaryItem('This Month', _getThisMonthTrips(trips).toString()),
        ],
      ),
    );
  }

  static pw.Widget _buildSummaryItem(String label, String value) {
    return pw.Column(
      children: [
        pw.Text(value, style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold, color: PdfColors.amber800)),
        pw.SizedBox(height: 4),
        pw.Text(label, style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600)),
      ],
    );
  }

  static int _getThisMonthTrips(List<Map<String, dynamic>> trips) {
    return trips.where((t) {
      final date = t['date']?.toString() ?? '';
      return date.contains('Today') || date.contains('Yesterday') || date.contains(_getCurrentMonth());
    }).length;
  }

  static String _getCurrentMonth() {
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[DateTime.now().month - 1];
  }

  static pw.Widget _buildTripsTable(List<Map<String, dynamic>> trips) {
    return pw.Table(
      border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
      columnWidths: {
        0: const pw.FlexColumnWidth(1.5),
        1: const pw.FlexColumnWidth(2),
        2: const pw.FlexColumnWidth(2),
        3: const pw.FlexColumnWidth(1),
        4: const pw.FlexColumnWidth(1.5),
      },
      children: [
        pw.TableRow(
          decoration: const pw.BoxDecoration(color: PdfColors.amber100),
          children: [
            _buildTableHeader('Date'),
            _buildTableHeader('From'),
            _buildTableHeader('To'),
            _buildTableHeader('Duration'),
            _buildTableHeader('Vehicle'),
          ],
        ),
        ...trips.map((trip) => pw.TableRow(
          children: [
            _buildTableCell(trip['date']?.toString() ?? '-'),
            _buildTableCell(trip['from']?.toString() ?? '-'),
            _buildTableCell(trip['to']?.toString() ?? '-'),
            _buildTableCell(trip['time']?.toString() ?? '-'),
            _buildTableCell(trip['vehicle']?.toString() ?? trip['type']?.toString() ?? '-'),
          ],
        )),
      ],
    );
  }

  static pw.Widget _buildTableHeader(String text) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(8),
      child: pw.Text(text, style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
    );
  }

  static pw.Widget _buildTableCell(String text) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(8),
      child: pw.Text(text, style: const pw.TextStyle(fontSize: 9)),
    );
  }
}
