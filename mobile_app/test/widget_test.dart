import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';

void main() {
  testWidgets('Unimak app renders root MaterialApp', (WidgetTester tester) async {
    await tester.pumpWidget(const UnimakApp());
    // Let startup timers (splash + initial wait) finish before test teardown.
    await tester.pump(const Duration(seconds: 3));
    expect(find.byType(UnimakApp), findsOneWidget);
  });
}
