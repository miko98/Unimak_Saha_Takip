import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';

void main() {
  testWidgets('Unimak app renders root MaterialApp', (WidgetTester tester) async {
    await tester.pumpWidget(const UnimakApp());
    expect(find.byType(UnimakApp), findsOneWidget);
  });
}
