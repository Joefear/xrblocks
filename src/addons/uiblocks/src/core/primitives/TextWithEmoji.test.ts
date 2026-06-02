import {describe, it, expect} from 'vitest';
import {TextWithEmoji} from './TextWithEmoji';
import {Text, Image, Container} from '@pmndrs/uikit';

describe('TextWithEmoji Primitives', () => {
  it('should parse plain text and spaces correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello World',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    // Should have: Text('Hello'), Container(space), Text('World')
    expect(textWithEmoji.children).toHaveLength(3);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Text);
  });

  it('should parse and render emojis correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello 🚀 World',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    // Should have: Text('Hello'), Container(space), Image(emoji), Container(space), Text('World')
    expect(textWithEmoji.children).toHaveLength(5);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Image);
    expect(textWithEmoji.children[3]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[4]).toBeInstanceOf(Text);
  });

  it('should handle single newline correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello\nWorld',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    expect(textWithEmoji.children).toHaveLength(3);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Text);

    const newlineContainer = textWithEmoji.children[1] as Container;
    expect(newlineContainer.properties.value.width).toBe('100%');
    expect(newlineContainer.properties.value.height).toBe(0);
  });

  it('should handle double newlines correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: 'Hello\n\nWorld',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    expect(textWithEmoji.children).toHaveLength(4);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Text);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[2]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[3]).toBeInstanceOf(Text);

    const newline1 = textWithEmoji.children[1] as Container;
    const newline2 = textWithEmoji.children[2] as Container;

    expect(newline1.properties.value.width).toBe('100%');
    expect(newline1.properties.value.height).toBe(0);

    expect(newline2.properties.value.width).toBe('100%');
    expect(newline2.properties.value.height).toBe(16); // matches fontSize 16
  });

  it('should handle leading newline correctly', () => {
    const parent = new Container();
    const textWithEmoji = new TextWithEmoji({
      text: '\nHello',
      fontSize: 16,
    });
    parent.add(textWithEmoji);

    expect(textWithEmoji.children).toHaveLength(2);
    expect(textWithEmoji.children[0]).toBeInstanceOf(Container);
    expect(textWithEmoji.children[1]).toBeInstanceOf(Text);

    const newline = textWithEmoji.children[0] as Container;
    expect(newline.properties.value.width).toBe('100%');
    expect(newline.properties.value.height).toBe(16); // matches fontSize 16
  });
});
